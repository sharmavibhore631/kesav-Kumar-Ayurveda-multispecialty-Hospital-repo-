import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Search, Plus, Eye, Trash2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

export default function PatientsPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', age: '', gender: '', phone: '', address: '', blood_group: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async (q = '') => {
    try {
      const { data } = await axios.get(`${API}/api/patients?search=${q}`);
      setPatients(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSearch = (e) => { setSearch(e.target.value); fetchPatients(e.target.value); };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`${API}/api/patients`, { ...form, age: parseInt(form.age) });
      toast.success(t('patientRegistered'));
      setDialogOpen(false);
      setForm({ name: '', age: '', gender: '', phone: '', address: '', blood_group: '' });
      fetchPatients(search);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('failedToRegisterPatient'));
    } finally { setSaving(false); }
  };

  const handleDelete = async (patientId, patientName) => {
    if (!window.confirm(`${t('deletePatientConfirm')} ${patientName}?`)) return;
    setDeletingId(patientId);
    try {
      await axios.delete(`${API}/api/patients/${patientId}`);
      toast.success(t('patientDeleted'));
      fetchPatients(search);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('failedToDeletePatient'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div data-testid="patients-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('patients')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{patients.length} {t('patientsRegistered')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white" data-testid="add-patient-button">
              <Plus size={16} className="mr-2" /> {t('addPatient')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>{t('registerNewPatient')}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">{t('fillPatientDetails')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4" data-testid="add-patient-form">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('fullName')}</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required data-testid="patient-name-input" />
                </div>
                <div className="space-y-2">
                  <Label>{t('age')}</Label>
                  <Input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} required data-testid="patient-age-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('gender')}</Label>
                  <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                    <SelectTrigger data-testid="patient-gender-select"><SelectValue placeholder={t('gender')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t('male')}</SelectItem>
                      <SelectItem value="Female">{t('female')}</SelectItem>
                      <SelectItem value="Other">{t('other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('phone')}</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required data-testid="patient-phone-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('bloodGroup')}</Label>
                  <Select value={form.blood_group} onValueChange={v => setForm(f => ({ ...f, blood_group: v }))}>
                    <SelectTrigger data-testid="patient-blood-select"><SelectValue placeholder={t('bloodGroup')} /></SelectTrigger>
                    <SelectContent>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('address')}</Label>
                  <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} data-testid="patient-address-input" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-[#0EA5E9] hover:bg-[#0284C7] text-white" disabled={saving} data-testid="patient-submit-button">
                {saving ? t('registering') : t('registerPatient')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input placeholder={t('searchByNamePhoneId')} value={search} onChange={handleSearch} className="pl-10" data-testid="patient-search-input" />
      </div>

      <Card className="border border-border shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('id')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('name')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('age')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('gender')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('phone')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('blood')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(3)].map((_, i) => <TableRow key={i}>{[...Array(7)].map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>)
              ) : patients.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{t('noPatientsFound')}</TableCell></TableRow>
              ) : (
                patients.map(p => (
                  <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-sm font-mono text-muted-foreground">{p.id}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.age}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.gender}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.phone}</TableCell>
                    <TableCell><span className="text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 font-medium">{p.blood_group || '-'}</span></TableCell>
                    <TableCell className="space-x-2">
                      <Button variant="ghost" size="sm" className="text-[#0EA5E9] hover:text-[#0284C7]" onClick={() => navigate(`/patients/${p.id}`)} data-testid={`view-patient-${p.id}`}>
                        <Eye size={14} className="mr-1" /> {t('view')}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800" onClick={() => handleDelete(p.id, p.name)} disabled={deletingId === p.id} data-testid={`delete-patient-${p.id}`}>
                        <Trash2 size={14} className="mr-1" /> {t('delete')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
