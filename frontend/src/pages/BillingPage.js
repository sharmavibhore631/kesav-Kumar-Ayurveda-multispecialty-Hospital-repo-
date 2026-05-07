import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Receipt, IndianRupee, CheckCircle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

export default function BillingPage() {
  const { t } = useLanguage();
  const [bills, setBills] = useState([]);
  const [patients, setPatients] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: '', notes: '' });
  const [items, setItems] = useState([{ description: '', amount: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [b, p, r] = await Promise.all([
        axios.get(`${API}/api/billing`),
        axios.get(`${API}/api/patients`),
        axios.get(`${API}/api/billing/revenue`),
      ]);
      setBills(b.data); setPatients(p.data); setRevenue(r.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const addItem = () => setItems(i => [...i, { description: '', amount: '' }]);
  const updateItem = (index, field, value) => setItems(i => i.map((item, idx) => idx === index ? { ...item, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : item));
  const removeItem = (index) => setItems(i => i.filter((_, idx) => idx !== index));
  const total = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.patient_id || items.length === 0) { toast.error('Please select patient and add items'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/api/billing`, { ...form, items: items.map(i => ({ description: i.description, amount: parseFloat(i.amount) || 0 })) });
      toast.success(t('billCreated')); setDialogOpen(false); setForm({ patient_id: '', notes: '' }); setItems([{ description: '', amount: '' }]); fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const updateBillStatus = async (id, status) => {
    try {
      await axios.put(`${API}/api/billing/${id}/status`, { status });
      toast.success(`Bill ${status}`); fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  return (
    <div data-testid="billing-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('billing')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{bills.length} {t('billsGenerated')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white" data-testid="create-bill-button"><Plus size={16} className="mr-2" /> {t('createBill')}</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>{t('createNewBill')}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">{t('addItemsGenBill')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4" data-testid="create-bill-form">
              <div className="space-y-2">
                <Label>{t('patient')}</Label>
                <Select value={form.patient_id} onValueChange={v => setForm(f => ({ ...f, patient_id: v }))}>
                  <SelectTrigger data-testid="bill-patient-select"><SelectValue placeholder={t('selectPatient')} /></SelectTrigger>
                  <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.id})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Label className="text-sm font-semibold">{t('billItems')}</Label><Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="add-bill-item"><Plus size={14} className="mr-1" /> {t('addItem2')}</Button></div>
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 items-end">
                    <div className="col-span-2 space-y-1"><Label className="text-xs">{t('description')}</Label><Input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder={t('consultation')} data-testid={`item-desc-${i}`} /></div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1"><Label className="text-xs">{t('amount')} (₹)</Label><Input type="number" step="0.01" value={item.amount} onChange={e => updateItem(i, 'amount', e.target.value)} data-testid={`item-amount-${i}`} /></div>
                      {items.length > 1 && <Button type="button" variant="ghost" size="sm" className="text-destructive shrink-0" onClick={() => removeItem(i)}>X</Button>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end"><p className="text-lg font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('total')}: ₹{total.toFixed(2)}</p></div>
              </div>
              <div className="space-y-2"><Label>{t('notesOptional')}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} data-testid="bill-notes-input" /></div>
              <Button type="submit" className="w-full bg-[#0EA5E9] hover:bg-[#0284C7] text-white" disabled={saving} data-testid="bill-submit-button">{saving ? t('creating') : t('createBill')}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center"><IndianRupee size={20} className="text-amber-500" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('thirtyDayRevenue')}</p>
                <p className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>₹{(revenue?.total_30_days || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 border border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base font-medium">{t('dailyRevenue')}</CardTitle></CardHeader>
          <CardContent>
            {revenue?.daily?.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={revenue.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip formatter={(v) => [`₹${v}`, t('revenue')]} />
                  <Bar dataKey="amount" fill="#10B981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{t('noPaidBillsYet')}</div>}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('id')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('patient')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('items')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('total')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('status')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('date')}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? [...Array(3)].map((_, i) => <TableRow key={i}>{[...Array(7)].map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>)
              : bills.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground"><Receipt className="mx-auto mb-2 text-[#0EA5E9]" size={24} />{t('noBillsYet')}</TableCell></TableRow>
              : bills.map(b => (
                <TableRow key={b.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-sm font-mono text-muted-foreground">{b.id}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{b.patient_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.items?.length || 0} {t('items')}</TableCell>
                  <TableCell className="text-sm font-bold text-foreground">₹{b.total_amount}</TableCell>
                  <TableCell>
                    <Badge className={b.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100' : b.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100'}>{b.status === 'paid' ? t('paid') : b.status === 'pending' ? t('pending') : t('cancelled')}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.created_at?.slice(0, 10)}</TableCell>
                  <TableCell>
                    {b.status === 'pending' && <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-[#10B981] hover:text-[#059669]" onClick={() => updateBillStatus(b.id, 'paid')} data-testid={`pay-${b.id}`}><CheckCircle size={14} /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateBillStatus(b.id, 'cancelled')} data-testid={`cancel-bill-${b.id}`}><XCircle size={14} /></Button>
                    </div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
