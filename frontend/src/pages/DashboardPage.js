import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Users, CalendarDays, IndianRupee, AlertTriangle, Stethoscope } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const PIE_COLORS = ['#0EA5E9', '#10B981', '#DC2626'];

export default function DashboardPage() {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const { data } = await axios.get(`${API}/api/dashboard/stats`);
      setStats(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-card rounded-lg border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  const statCards = [
    { label: t('totalPatients'), value: stats?.total_patients || 0, icon: Users, color: '#0EA5E9', bg: 'bg-sky-50 dark:bg-sky-900/20' },
    { label: t('todaysAppointments'), value: stats?.today_appointments || 0, icon: CalendarDays, color: '#10B981', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: t('doctorsCount'), value: stats?.total_doctors || 0, icon: Stethoscope, color: '#8B5CF6', bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: t('todaysRevenue'), value: `₹${(stats?.today_revenue || 0).toLocaleString('en-IN')}`, icon: IndianRupee, color: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: t('lowStockItems'), value: stats?.low_stock_items || 0, icon: AlertTriangle, color: stats?.low_stock_items > 0 ? '#DC2626' : '#10B981', bg: stats?.low_stock_items > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20' },
  ];

  const pieData = stats?.appointment_breakdown ? [
    { name: t('scheduled'), value: stats.appointment_breakdown.scheduled },
    { name: t('completed'), value: stats.appointment_breakdown.completed },
    { name: t('cancelled'), value: stats.appointment_breakdown.cancelled },
  ].filter(d => d.value > 0) : [];

  const scheduledQueue = stats?.recent_appointments?.filter(a => a.status === 'scheduled') || [];

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>
          {t('dashboardTitle')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('dashboardSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card, i) => (
          <Card key={card.label} className={`stat-card fade-in stagger-${i + 1} border border-border shadow-none`} data-testid={`stat-card-${i}`}>
            <CardContent className="p-5">
              <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                <card.icon size={20} style={{ color: card.color }} />
              </div>
              <p className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>{card.value}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border border-border shadow-none">
          <CardHeader><CardTitle className="text-lg font-medium" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('revenueLast30')}</CardTitle></CardHeader>
          <CardContent>
            {stats?.revenue_chart?.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.revenue_chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip formatter={(v) => [`₹${v}`, t('revenue')]} />
                  <Bar dataKey="amount" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">{t('noRevenueData')}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none">
          <CardHeader><CardTitle className="text-lg font-medium" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('appointments')}</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">{t('noAppointmentsYet')}</div>
            )}
            <div className="flex justify-center gap-4 mt-2">
              {[t('scheduled'), t('completed'), t('cancelled')].map((label, i) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                  {label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border shadow-none">
          <CardHeader><CardTitle className="text-lg font-medium" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('recentPatients')}</CardTitle></CardHeader>
          <CardContent>
            {stats?.recent_patients?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_patients.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.id} &middot; {p.gender}, {p.age}{t('years').charAt(0)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.phone}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t('noPatientsYet')}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none">
          <CardHeader><CardTitle className="text-lg font-medium" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('recentAppointments')}</CardTitle></CardHeader>
          <CardContent>
            {stats?.recent_appointments?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_appointments.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.patient_name}</p>
                      <p className="text-xs text-muted-foreground">Dr. {a.doctor_name} &middot; {a.date}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      a.status === 'scheduled' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' :
                      a.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>{a.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t('noAppointmentsYet')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border shadow-none">
          <CardHeader><CardTitle className="text-lg font-medium" style={{ fontFamily: 'Manrope, sans-serif' }}>{t('liveQueue')}</CardTitle></CardHeader>
          <CardContent>
            {scheduledQueue.length > 0 ? (
              <div className="space-y-3">
                {scheduledQueue.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.patient_name}</p>
                      <p className="text-xs text-muted-foreground">Dr. {a.doctor_name} &middot; {a.date}</p>
                    </div>
                    <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-xs px-2 py-1 rounded-full">{t('scheduled')}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t('noAppointmentsYet')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
