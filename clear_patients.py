import requests
import json

# Login credentials
admin_email = "admin@example.com"
admin_password = "admin123"

# Patient IDs to delete
patient_ids = [
    "P-0B04D326",
    "P-A46110B6",
    "P-A624C992",
    "P-C16B625C",
    "P-5E103C9D"
]

# Base URL
base_url = "http://localhost:8000/api"

try:
    # Step 1: Login as admin
    print("Logging in as admin...")
    login_response = requests.post(
        f"{base_url}/auth/login",
        json={"email": admin_email, "password": admin_password}
    )
    
    if login_response.status_code != 200:
        print(f"Login failed: {login_response.text}")
    else:
        print("✓ Login successful")
        
        # Extract token if available
        cookies = login_response.cookies
        
        # Step 2: Delete each patient
        for patient_id in patient_ids:
            print(f"\nDeleting patient {patient_id}...")
            delete_response = requests.delete(
                f"{base_url}/patients/{patient_id}",
                cookies=cookies
            )
            
            if delete_response.status_code == 200:
                print(f"✓ {patient_id} deleted successfully")
            else:
                print(f"✗ Failed to delete {patient_id}: {delete_response.text}")
        
        print("\n✓ All patients cleared!")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
