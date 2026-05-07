from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import uuid
import re
import asyncio
import base64
from cryptography.fernet import Fernet
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --- Password & JWT Helpers ---
def get_jwt_secret():
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY")
    if not key:
        raw = get_jwt_secret().encode("utf-8")[:32].ljust(32, b"0")
        key = base64.urlsafe_b64encode(raw).decode("utf-8")
    if isinstance(key, str):
        key = key.encode("utf-8")
    try:
        return Fernet(key)
    except Exception:
        raw = get_jwt_secret().encode("utf-8")[:32].ljust(32, b"0")
        return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_text(value: str) -> str:
    if value is None:
        return ""
    return get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_text(value: str) -> str:
    if not value:
        return ""
    try:
        return get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        return value


async def _insert_audit_doc(audit_doc: dict) -> None:
    await db.audit_logs.insert_one(audit_doc)


def log_audit(collection_name: str, record_id: str, action: str, user: dict, details: dict):
    audit_doc = {
        "collection": collection_name,
        "record_id": record_id,
        "action": action,
        "user_email": user.get("email"),
        "user_role": user.get("role"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": details
    }
    return asyncio.create_task(_insert_audit_doc(audit_doc))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")


# --- Pydantic Models ---
class RegisterInput(BaseModel):
    email: str
    password: str
    name: str
    role: str = "staff"


class LoginInput(BaseModel):
    email: str
    password: str


class PatientInput(BaseModel):
    name: str
    age: int
    gender: str
    phone: str
    address: str = ""
    blood_group: str = ""


class AppointmentInput(BaseModel):
    patient_id: str
    doctor_id: str
    date: str
    time_slot: str
    notes: str = ""


class PrescriptionInput(BaseModel):
    patient_id: str
    doctor_id: str
    diagnosis: str
    medicines: list
    notes: str = ""


class InventoryInput(BaseModel):
    medicine_name: str
    category: str = ""
    quantity: int
    unit_price: float
    threshold: int = 10
    supplier: str = ""


class StockUpdateInput(BaseModel):
    change_type: str
    quantity: int
    reason: str = ""


class BillInput(BaseModel):
    patient_id: str
    items: list
    notes: str = ""


class DoctorInput(BaseModel):
    name: str
    email: str
    password: str
    specialization: str
    phone: str = ""


# ==================== AUTH ROUTES ====================
@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name,
        "role": input.role,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)
    return {"id": user_id, "email": email, "name": input.name, "role": input.role, "access_token": access_token}


@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request, response: Response):
    email = input.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until", "")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user["password_hash"]):
        current_count = (attempt.get("count", 0) if attempt else 0) + 1
        update_fields = {"$inc": {"count": 1}}
        if current_count >= 5:
            update_fields["$set"] = {"locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}
        await db.login_attempts.update_one(
            {"identifier": identifier}, update_fields, upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"identifier": identifier})
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)
    return {"id": user_id, "email": email, "name": user["name"], "role": user["role"], "access_token": access_token}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user


# ==================== PATIENT ROUTES ====================
@api_router.get("/patients")
async def list_patients(request: Request, search: str = ""):
    await get_current_user(request)
    query = {"is_deleted": False}
    if search:
        normalized_search = re.sub(r"\D", "", search)
        or_clauses = [
            {"name": {"$regex": search, "$options": "i"}},
            {"id": {"$regex": search, "$options": "i"}}
        ]
        if normalized_search:
            or_clauses.append({"phone_search": {"$regex": normalized_search}})
        query["$or"] = or_clauses
    patients = await db.patients.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for patient in patients:
        patient["phone"] = decrypt_text(patient.get("phone", ""))
        patient["address"] = decrypt_text(patient.get("address", ""))
    return patients


@api_router.post("/patients")
async def create_patient(input: PatientInput, request: Request):
    user = await get_current_user(request)
    patient_id = f"P-{str(uuid.uuid4())[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    normalized_phone = re.sub(r"\D", "", input.phone)
    patient_doc = {
        "id": patient_id,
        "name": input.name,
        "age": input.age,
        "gender": input.gender,
        "phone": encrypt_text(input.phone),
        "phone_search": normalized_phone,
        "address": encrypt_text(input.address),
        "blood_group": input.blood_group,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "is_deleted": False,
        "created_by": user["email"],
        "updated_by": user["email"]
    }
    await db.patients.insert_one(patient_doc)
    log_audit("patients", patient_id, "create", user, {"patient": patient_doc})
    created = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    created["phone"] = decrypt_text(created.get("phone", ""))
    created["address"] = decrypt_text(created.get("address", ""))
    return created


@api_router.get("/patients/{patient_id}")
async def get_patient(patient_id: str, request: Request):
    await get_current_user(request)
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    patient["phone"] = decrypt_text(patient.get("phone", ""))
    patient["address"] = decrypt_text(patient.get("address", ""))
    visits = await db.visits.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(100)
    appointments = await db.appointments.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(100)
    prescriptions = await db.prescriptions.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    bills = await db.bills.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {**patient, "visits": visits, "appointments": appointments, "prescriptions": prescriptions, "bills": bills}


@api_router.put("/patients/{patient_id}")
async def update_patient(patient_id: str, input: PatientInput, request: Request):
    user = await get_current_user(request)
    existing = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")
    updated_at = datetime.now(timezone.utc).isoformat()
    normalized_phone = re.sub(r"\D", "", input.phone)
    result = await db.patients.update_one(
        {"id": patient_id},
        {"$set": {
            "name": input.name,
            "age": input.age,
            "gender": input.gender,
            "phone": encrypt_text(input.phone),
            "phone_search": normalized_phone,
            "address": encrypt_text(input.address),
            "blood_group": input.blood_group,
            "updated_at": updated_at,
            "updated_by": user["email"]
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    log_audit("patients", patient_id, "update", user, {"before": existing, "after": {"name": input.name, "age": input.age, "gender": input.gender, "blood_group": input.blood_group}})
    return {"message": "Patient updated"}


@api_router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "doctor"]:
        raise HTTPException(status_code=403, detail="Only admin or doctor can delete patients")
    existing = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")
    deleted_at = datetime.now(timezone.utc).isoformat()
    result = await db.patients.update_one(
        {"id": patient_id},
        {"$set": {"is_deleted": True, "deleted_at": deleted_at, "deleted_by": user["email"], "updated_at": deleted_at}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    log_audit("patients", patient_id, "delete", user, {"deleted_at": deleted_at, "deleted_by": user["email"]})
    return {"message": "Patient soft deleted"}


@api_router.get("/patients/{patient_id}/audit")
async def get_patient_audit(patient_id: str, request: Request):
    await get_current_user(request)
    logs = await db.audit_logs.find({"collection": "patients", "record_id": patient_id}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return logs


# ==================== DOCTOR ROUTES ====================
@api_router.get("/doctors")
async def list_doctors(request: Request):
    await get_current_user(request)
    doctors = []
    async for doc in db.users.find({"role": "doctor"}):
        doctors.append({
            "id": str(doc["_id"]),
            "name": doc.get("name", ""),
            "email": doc.get("email", ""),
            "specialization": doc.get("specialization", ""),
            "phone": doc.get("phone", ""),
            "role": "doctor"
        })
    return doctors


@api_router.post("/doctors")
async def create_doctor(input: DoctorInput, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can add doctors")
    email = input.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name,
        "role": "doctor",
        "specialization": input.specialization,
        "phone": input.phone,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(doc)
    return {"id": str(result.inserted_id), "name": input.name, "email": email, "specialization": input.specialization}


# ==================== APPOINTMENT ROUTES ====================
@api_router.get("/appointments")
async def list_appointments(request: Request, date: str = "", status: str = ""):
    await get_current_user(request)
    query = {}
    if date:
        query["date"] = date
    if status:
        query["status"] = status
    appointments = await db.appointments.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return appointments


@api_router.post("/appointments")
async def create_appointment(input: AppointmentInput, request: Request):
    user = await get_current_user(request)
    existing = await db.appointments.find_one({
        "doctor_id": input.doctor_id, "date": input.date,
        "time_slot": input.time_slot, "status": {"$ne": "cancelled"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Time slot already booked")

    patient = await db.patients.find_one({"id": input.patient_id}, {"_id": 0})
    doctor = await db.users.find_one({"_id": ObjectId(input.doctor_id)})

    appt_id = f"APT-{str(uuid.uuid4())[:8].upper()}"
    appt_doc = {
        "id": appt_id,
        "patient_id": input.patient_id,
        "patient_name": patient["name"] if patient else "Unknown",
        "doctor_id": input.doctor_id,
        "doctor_name": doctor["name"] if doctor else "Unknown",
        "date": input.date,
        "time_slot": input.time_slot,
        "status": "scheduled",
        "notes": input.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["email"]
    }
    await db.appointments.insert_one(appt_doc)

    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "title": "New Appointment",
        "message": f"Appointment for {appt_doc['patient_name']} with Dr. {appt_doc['doctor_name']} on {input.date} at {input.time_slot}",
        "type": "appointment",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    created = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    return created


class StatusUpdateInput(BaseModel):
    status: str


@api_router.put("/appointments/{appt_id}/status")
async def update_appointment_status(appt_id: str, input: StatusUpdateInput, request: Request):
    await get_current_user(request)
    status = input.status
    if status not in ["scheduled", "completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.appointments.update_one({"id": appt_id}, {"$set": {"status": status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if status == "completed":
        appt = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
        if appt:
            await db.visits.insert_one({
                "id": str(uuid.uuid4()),
                "patient_id": appt["patient_id"],
                "doctor_id": appt["doctor_id"],
                "doctor_name": appt.get("doctor_name", ""),
                "date": appt["date"],
                "notes": appt.get("notes", ""),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    return {"message": f"Appointment {status}"}


@api_router.get("/appointments/slots")
async def get_available_slots(doctor_id: str, date: str, request: Request):
    await get_current_user(request)
    all_slots = [
        "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
        "12:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"
    ]
    booked = await db.appointments.find(
        {"doctor_id": doctor_id, "date": date, "status": {"$ne": "cancelled"}},
        {"_id": 0, "time_slot": 1}
    ).to_list(100)
    booked_slots = [a["time_slot"] for a in booked]
    available = [s for s in all_slots if s not in booked_slots]
    return {"slots": available, "booked": booked_slots}


# ==================== PRESCRIPTION ROUTES ====================
@api_router.get("/prescriptions")
async def list_prescriptions(request: Request):
    await get_current_user(request)
    prescriptions = await db.prescriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return prescriptions


@api_router.post("/prescriptions")
async def create_prescription(input: PrescriptionInput, request: Request):
    user = await get_current_user(request)
    patient = await db.patients.find_one({"id": input.patient_id}, {"_id": 0})
    doctor = await db.users.find_one({"_id": ObjectId(input.doctor_id)})

    presc_id = f"RX-{str(uuid.uuid4())[:8].upper()}"
    presc_doc = {
        "id": presc_id,
        "patient_id": input.patient_id,
        "patient_name": patient["name"] if patient else "Unknown",
        "doctor_id": input.doctor_id,
        "doctor_name": doctor["name"] if doctor else "Unknown",
        "diagnosis": input.diagnosis,
        "medicines": input.medicines,
        "notes": input.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["email"]
    }
    await db.prescriptions.insert_one(presc_doc)

    # Auto-deduct inventory
    for med in input.medicines:
        med_name = med.get("name", "")
        qty = med.get("quantity", 1)
        inv_item = await db.inventory.find_one({"medicine_name": {"$regex": f"^{re.escape(med_name)}$", "$options": "i"}})
        if inv_item:
            new_qty = max(0, inv_item["quantity"] - qty)
            await db.inventory.update_one(
                {"id": inv_item["id"]},
                {"$set": {"quantity": new_qty, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            await db.stock_logs.insert_one({
                "id": str(uuid.uuid4()), "inventory_id": inv_item["id"],
                "medicine_name": med_name, "change_type": "out",
                "quantity": qty, "reason": f"Prescription {presc_id}",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            if new_qty <= inv_item.get("threshold", 10):
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()), "title": "Low Stock Alert",
                    "message": f"{med_name} is running low ({new_qty} remaining)",
                    "type": "inventory", "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })

    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "title": "Prescription Generated",
        "message": f"Prescription {presc_id} for {presc_doc['patient_name']}",
        "type": "prescription", "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    created = await db.prescriptions.find_one({"id": presc_id}, {"_id": 0})
    return created


@api_router.get("/prescriptions/{presc_id}")
async def get_prescription(presc_id: str, request: Request):
    await get_current_user(request)
    presc = await db.prescriptions.find_one({"id": presc_id}, {"_id": 0})
    if not presc:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return presc


# ==================== INVENTORY ROUTES ====================
@api_router.get("/inventory")
async def list_inventory(request: Request, search: str = ""):
    await get_current_user(request)
    query = {}
    if search:
        query = {"medicine_name": {"$regex": search, "$options": "i"}}
    items = await db.inventory.find(query, {"_id": 0}).sort("medicine_name", 1).to_list(1000)
    return items


@api_router.post("/inventory")
async def create_inventory(input: InventoryInput, request: Request):
    user = await get_current_user(request)
    inv_id = f"INV-{str(uuid.uuid4())[:8].upper()}"
    inv_doc = {
        "id": inv_id,
        "medicine_name": input.medicine_name,
        "category": input.category,
        "quantity": input.quantity,
        "unit_price": input.unit_price,
        "threshold": input.threshold,
        "supplier": input.supplier,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory.insert_one(inv_doc)
    created = await db.inventory.find_one({"id": inv_id}, {"_id": 0})
    return created


@api_router.put("/inventory/{inv_id}")
async def update_inventory(inv_id: str, input: InventoryInput, request: Request):
    await get_current_user(request)
    result = await db.inventory.update_one(
        {"id": inv_id},
        {"$set": {
            "medicine_name": input.medicine_name, "category": input.category,
            "quantity": input.quantity, "unit_price": input.unit_price,
            "threshold": input.threshold, "supplier": input.supplier,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Inventory updated"}


@api_router.post("/inventory/{inv_id}/stock")
async def update_stock(inv_id: str, input: StockUpdateInput, request: Request):
    await get_current_user(request)
    item = await db.inventory.find_one({"id": inv_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    new_qty = item["quantity"] + input.quantity if input.change_type == "in" else max(0, item["quantity"] - input.quantity)
    await db.inventory.update_one(
        {"id": inv_id},
        {"$set": {"quantity": new_qty, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.stock_logs.insert_one({
        "id": str(uuid.uuid4()), "inventory_id": inv_id,
        "medicine_name": item["medicine_name"], "change_type": input.change_type,
        "quantity": input.quantity, "reason": input.reason,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    if new_qty <= item.get("threshold", 10):
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "title": "Low Stock Alert",
            "message": f"{item['medicine_name']} is running low ({new_qty} remaining)",
            "type": "inventory", "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    return {"message": "Stock updated", "new_quantity": new_qty}


# ==================== BILLING ROUTES ====================
@api_router.get("/billing")
async def list_bills(request: Request):
    await get_current_user(request)
    bills = await db.bills.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return bills


@api_router.post("/billing")
async def create_bill(input: BillInput, request: Request):
    user = await get_current_user(request)
    patient = await db.patients.find_one({"id": input.patient_id}, {"_id": 0})
    total = sum(item.get("amount", 0) for item in input.items)
    bill_id = f"BILL-{str(uuid.uuid4())[:8].upper()}"
    bill_doc = {
        "id": bill_id,
        "patient_id": input.patient_id,
        "patient_name": patient["name"] if patient else "Unknown",
        "items": input.items,
        "total_amount": total,
        "status": "pending",
        "notes": input.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["email"]
    }
    await db.bills.insert_one(bill_doc)
    created = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    return created


@api_router.put("/billing/{bill_id}/status")
async def update_bill_status(bill_id: str, input: StatusUpdateInput, request: Request):
    await get_current_user(request)
    status = input.status
    if status not in ["pending", "paid", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.bills.update_one({"id": bill_id}, {"$set": {"status": status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bill not found")
    return {"message": f"Bill {status}"}


@api_router.get("/billing/revenue")
async def get_revenue(request: Request):
    await get_current_user(request)
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    bills = await db.bills.find(
        {"created_at": {"$gte": thirty_days_ago}, "status": "paid"}, {"_id": 0}
    ).to_list(1000)
    daily_revenue = {}
    for bill in bills:
        day = bill["created_at"][:10]
        daily_revenue[day] = daily_revenue.get(day, 0) + bill.get("total_amount", 0)
    revenue_list = [{"date": k, "amount": v} for k, v in sorted(daily_revenue.items())]
    total = sum(bill.get("total_amount", 0) for bill in bills)
    return {"daily": revenue_list, "total_30_days": total}


# ==================== DASHBOARD ====================
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(request: Request):
    await get_current_user(request)
    total_patients = await db.patients.count_documents({"is_deleted": False})
    total_doctors = await db.users.count_documents({"role": "doctor"})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_appointments = await db.appointments.count_documents({"date": today, "status": {"$ne": "cancelled"}})
    low_stock = await db.inventory.count_documents({"$expr": {"$lte": ["$quantity", "$threshold"]}})

    today_start = today + "T00:00:00"
    today_bills = await db.bills.find({"created_at": {"$gte": today_start}, "status": "paid"}, {"_id": 0}).to_list(1000)
    today_revenue = sum(b.get("total_amount", 0) for b in today_bills)

    recent_appointments = await db.appointments.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_patients = await db.patients.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    monthly_bills = await db.bills.find({"created_at": {"$gte": thirty_days_ago}, "status": "paid"}, {"_id": 0}).to_list(1000)
    daily_revenue = {}
    for bill in monthly_bills:
        day = bill["created_at"][:10]
        daily_revenue[day] = daily_revenue.get(day, 0) + bill.get("total_amount", 0)
    revenue_chart = [{"date": k, "amount": v} for k, v in sorted(daily_revenue.items())]

    scheduled = await db.appointments.count_documents({"status": "scheduled"})
    completed = await db.appointments.count_documents({"status": "completed"})
    cancelled = await db.appointments.count_documents({"status": "cancelled"})

    return {
        "total_patients": total_patients,
        "total_doctors": total_doctors,
        "today_appointments": today_appointments,
        "low_stock_items": low_stock,
        "today_revenue": today_revenue,
        "recent_appointments": recent_appointments,
        "recent_patients": recent_patients,
        "revenue_chart": revenue_chart,
        "appointment_breakdown": {"scheduled": scheduled, "completed": completed, "cancelled": cancelled}
    }


# ==================== NOTIFICATIONS ====================
@api_router.get("/notifications")
async def list_notifications(request: Request):
    await get_current_user(request)
    notifications = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return notifications


@api_router.put("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, request: Request):
    await get_current_user(request)
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    return {"message": "Marked as read"}


@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(request: Request):
    await get_current_user(request)
    await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"message": "All marked as read"}


# ==================== APP SETUP ====================
app.include_router(api_router)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def create_database_backup() -> None:
    backup_folder = Path(__file__).parent / "backups"
    backup_folder.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = backup_folder / f"backup_{timestamp}.json"
    backup_data = {}
    for collection_name in await db.list_collection_names():
        docs = await db[collection_name].find({}, {"_id": 0}).to_list(10000)
        backup_data[collection_name] = docs
    with open(backup_file, "w", encoding="utf-8") as f:
        import json
        json.dump(backup_data, f, indent=2, default=str)
    logger.info(f"Database backup created: {backup_file}")


async def backup_loop():
    interval = int(os.environ.get("BACKUP_INTERVAL_SECONDS", "86400"))
    while True:
        try:
            await create_database_backup()
        except Exception as exc:
            logger.error(f"Backup failed: {exc}")
        await asyncio.sleep(interval)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.patients.create_index("id", unique=True)
    await db.patients.create_index("is_deleted")
    await db.appointments.create_index("id", unique=True)
    await db.prescriptions.create_index("id", unique=True)
    await db.inventory.create_index("id", unique=True)
    await db.bills.create_index("id", unique=True)
    await db.audit_logs.create_index([("collection", 1), ("record_id", 1), ("timestamp", -1)])
    await seed_admin()
    asyncio.create_task(backup_loop())


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Admin password updated")

    # Seed doctors
    doctors_to_seed = [
        {"email": "vijay.sharma@kumarayurveda.com", "password": "VijayDoc@123", "name": "Vaidy Vijay Sharma", "specialization": "General Ayurveda", "phone": ""},
        {"email": "ramavatar.sharma@kumarayurveda.com", "password": "RamavatarDoc@123", "name": "Vaidy Ramavatar Sharma", "specialization": "General Ayurveda", "phone": ""},
        {"email": "jolly.sharma@kumarayurveda.com", "password": "JollyDoc@123", "name": "Vaidy Jolly Sharma", "specialization": "Gynecologist - Female Health Specialist", "phone": ""},
    ]
    for doc in doctors_to_seed:
        existing_doc = await db.users.find_one({"email": doc["email"]})
        if existing_doc is None:
            await db.users.insert_one({
                "email": doc["email"],
                "password_hash": hash_password(doc["password"]),
                "name": doc["name"],
                "role": "doctor",
                "specialization": doc["specialization"],
                "phone": doc["phone"],
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"Doctor seeded: {doc['name']}")
        elif not verify_password(doc["password"], existing_doc["password_hash"]):
            await db.users.update_one(
                {"email": doc["email"]},
                {"$set": {"password_hash": hash_password(doc["password"])}}
            )

    memory_folder = Path(__file__).resolve().parents[1] / "memory"
    memory_folder.mkdir(parents=True, exist_ok=True)
    with open(memory_folder / "test_credentials.md", "w", encoding="utf-8") as f:
        f.write("# Test Credentials\n\n")
        f.write(f"## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n")
        f.write("## Doctors\n")
        for doc in doctors_to_seed:
            f.write(f"- {doc['name']}: Email: {doc['email']} / Password: {doc['password']}\n")
        f.write("\n## Auth Endpoints\n- POST /api/auth/login\n- POST /api/auth/register\n- POST /api/auth/logout\n- GET /api/auth/me\n")


@app.on_event("shutdown")
async def shutdown():
    client.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=os.environ.get("BACKEND_HOST", "0.0.0.0"),
        port=int(os.environ.get("BACKEND_PORT", "8000")),
        log_level="info",
    )
