import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ArrowLeft, User, Phone, MapPin, Droplets, CalendarDays, FileText, Receipt, Trash2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

export default function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchPatient(); }, [id]);

  const fetchPatient = async () => {
    try {
      const { data } = await axios.get(`${API}/api/patients/${id}`);
      setPatient(data);
    } catch { navigate('/patients'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`${t('deletePatientConfirm')} ${patient.name}?`)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/api/patients/${id}`);
      toast.success(t('patientDeleted'));
      navigate('/patients');
    } catch (err) {
      toast.error(err.response?.data?.detail || t('failedToDeletePatient'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-card rounded-lg border border-border animate-pulse" />)}</div>;
  if (!patient) return null;

  return (
    <div data-testid="patient-detail-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/patients')} className="text-muted-foreground hover:text-foreground" data-testid="back-to-patients">
          <ArrowLeft size={16} className="mr-2" /> {t('backToPatients')}
        </Button>
        <Button variant="ghost" className="text-red-600 hover:text-red-800" onClick={handleDelete} disabled={deleting} data-testid="delete-patient-button">
          <Trash2 size={16} className="mr-2" /> {t('deletePatient')}
        </Button>
      </div>

      <Card className="border border-border shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 bg-[#0EA5E9] rounded-xl flex items-center justify-center text-white text-2xl font-bold shrink-0" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {patient.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>{patient.name}</h2>
                <p className="text-sm text-muted-foreground font-mono mt-1">{patient.id}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><User size={14} /> {patient.gender}, {patient.age} {t('years')}</div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone size={14} /> {patient.phone}</div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Droplets size={14} /> {t('bloodGroup')}: <Badge variant="outline">{patient.blood_group || 'N/A'}</Badge></div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin size={14} /> {patient.address || t('noAddress')}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="appointments" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="appointments" data-testid="tab-appointments"><CalendarDays size={14} className="mr-1.5" /> {t('appointments')} ({patient.appointments?.length || 0})</TabsTrigger>
          <TabsTrigger value="prescriptions" data-testid="tab-prescriptions"><FileText size={14} className="mr-1.5" /> {t('prescriptions')} ({patient.prescriptions?.length || 0})</TabsTrigger>
          <TabsTrigger value="bills" data-testid="tab-bills"><Receipt size={14} className="mr-1.5" /> {t('billing')} ({patient.bills?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="appointments">
          <Card className="border border-border shadow-none"><CardContent className="p-6">
            {patient.appointments?.length > 0 ? (
              <div className="space-y-3">{patient.appointments.map(a => (
                <div key={a.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div><p className="text-sm font-medium text-foreground">{a.date} at {a.time_slot}</p><p className="text-xs text-muted-foreground">Dr. {a.doctor_name}</p></div>
                  <Badge className={a.status === 'scheduled' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 hover:bg-sky-100' : a.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100'}>{a.status}</Badge>
                </div>
              ))}</div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">{t('noAppointmentsFound')}</p>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="prescriptions">
          <Card className="border border-border shadow-none"><CardContent className="p-6">
            {patient.prescriptions?.length > 0 ? (
              <div className="space-y-4">{patient.prescriptions.map(rx => (
                <div key={rx.id} className="p-4 border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-foreground">{rx.id}</p><p className="text-xs text-muted-foreground">{rx.created_at?.slice(0, 10)}</p></div>
                  <p className="text-sm text-muted-foreground mb-2">{t('diagnosis')}: {rx.diagnosis}</p>
                  <p className="text-xs text-muted-foreground">Dr. {rx.doctor_name}</p>
                  {rx.medicines?.length > 0 && <div className="mt-2 flex gap-2 flex-wrap">{rx.medicines.map((m, i) => <Badge key={i} variant="outline" className="text-xs">{m.name} - {m.dosage}</Badge>)}</div>}
                </div>
              ))}</div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">{t('noPrescriptionsYet')}</p>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="bills">
          <Card className="border border-border shadow-none"><CardContent className="p-6">
            {patient.bills?.length > 0 ? (
              <div className="space-y-3">{patient.bills.map(b => (
                <div key={b.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div><p className="text-sm font-medium text-foreground">{b.id}</p><p className="text-xs text-muted-foreground">{b.created_at?.slice(0, 10)}</p></div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-foreground">₹{b.total_amount}</p>
                    <Badge className={b.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100' : b.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100'}>{b.status}</Badge>
                  </div>
                </div>
              ))}</div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">{t('noBillsYet')}</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
