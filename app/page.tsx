"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../app/lib/supabase';

export default function PokerApp() {
  const [activeTab, setActiveTab] = useState<'input' | 'ranking' | 'master'>('input');
  const [filterUnpaid, setFilterUnpaid] = useState(false); // 未精算フィルターの状態
  const [members, setMembers] = useState<string[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from('players').select('name');
    if (pData) setMembers(pData.map(p => p.name));

    const { data: sData } = await supabase.from('sessions').select('*').order('created_at', { ascending: false });
    if (sData) {
      const grouped = sData.reduce((acc: any, curr) => {
        if (!acc[curr.event_id]) {
          acc[curr.event_id] = { 
            id: curr.event_id, 
            date: new Date(curr.created_at).toLocaleString(), 
            status: curr.status, 
            data: [] 
          };
        }
        acc[curr.event_id].data.push({ name: curr.player_name, amount: curr.amount });
        return acc;
      }, {});
      setEvents(Object.values(grouped));
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // フィルターされたイベント一覧
  const filteredEvents = useMemo(() => {
    if (filterUnpaid) {
      return events.filter(ev => ev.status === "未清算");
    }
    return events;
  }, [events, filterUnpaid]);

  const ranking = useMemo(() => {
    const stats: Record<string, { total: number; games: number }> = {};
    events.forEach(ev => {
      ev.data.forEach((d: any) => {
        if (!stats[d.name]) stats[d.name] = { total: 0, games: 0 };
        stats[d.name].total += d.amount;
        stats[d.name].games += 1;
      });
    });
    return Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [events]);

  const saveEvent = async () => {
    const total = selectedIds.reduce((sum, name) => sum + (amounts[name] || 0), 0);
    if (total !== 0) return alert("合計を0円にしてください");
    const eventId = crypto.randomUUID();
    const insertData = selectedIds.map(name => ({ event_id: eventId, player_name: name, amount: amounts[name] || 0, status: "未清算" }));
    const { error } = await supabase.from('sessions').insert(insertData);
    if (error) alert("保存に失敗しました");
    else { alert("保存完了！"); fetchData(); setSelectedIds([]); setAmounts({}); }
  };

  const deleteMember = async (name: string) => {
    if (!confirm(`${name}さんを削除しますか？`)) return;
    await supabase.from('players').delete().eq('name', name);
    fetchData();
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm("このゲーム記録を完全に削除しますか？")) return;
    await supabase.from('sessions').delete().eq('event_id', eventId);
    fetchData();
  };

  const toggleStatus = async (eventId: string, currentStatus: string) => {
    const newStatus = currentStatus === "未清算" ? "清算済み" : "未清算";
    await supabase.from('sessions').update({ status: newStatus }).eq('event_id', eventId);
    fetchData();
  };

  const addMember = async () => {
    if (!newMemberName) return;
    const { error } = await supabase.from('players').insert([{ name: newMemberName }]);
    if (error) alert("既にあるか、エラーです");
    else { setNewMemberName(''); fetchData(); }
  };

  if (loading) return <div className="p-10 text-center text-slate-400 font-bold">Loading Database...</div>;

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen font-sans text-slate-900">
      <div className="text-center text-[10px] text-emerald-500 mb-4 font-black uppercase tracking-widest">● Online Database Connected</div>

      <div className="flex bg-white p-1 rounded-xl shadow-sm mb-6 border border-slate-100">
        {(['input', 'ranking', 'master'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {tab === 'input' ? 'Record' : tab === 'ranking' ? 'Rank' : 'Master'}
          </button>
        ))}
      </div>

      {activeTab === 'input' && (
        <>
          <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 border border-slate-100">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">New Session</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {members.map(m => (
                <button key={m} onClick={() => setSelectedIds(prev => prev.includes(m) ? prev.filter(n => n !== m) : [...prev, m])}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.includes(m) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{m}</button>
              ))}
            </div>
            {selectedIds.map(name => (
              <div key={name} className="flex items-center justify-between mb-3">
                <span className="font-bold text-slate-700">{name}</span>
                <input type="number" placeholder="0" value={amounts[name] || ""} onChange={(e) => setAmounts({ ...amounts, [name]: parseInt(e.target.value) || 0 })}
                  className="w-28 p-2 border-2 border-slate-100 rounded-lg text-right focus:border-indigo-400 outline-none font-mono text-slate-900 font-bold" />
              </div>
            ))}
            <button onClick={saveEvent} disabled={selectedIds.length === 0} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black mt-4 disabled:bg-slate-200 active:scale-95">SAVE SESSION</button>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recent Events</h2>
              {/* フィルターボタン */}
              <button 
                onClick={() => setFilterUnpaid(!filterUnpaid)}
                className={`text-[10px] font-black px-3 py-1 rounded-full border transition-all ${filterUnpaid ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-400 border-slate-200'}`}
              >
                {filterUnpaid ? 'SHOWING UNPAID' : 'SHOW ALL'}
              </button>
            </div>
            
            {filteredEvents.length === 0 && (
              <div className="text-center py-10 text-slate-300 text-xs font-bold">No events found.</div>
            )}

            {filteredEvents.map(ev => (
              <div key={ev.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative">
                <button onClick={() => deleteEvent(ev.id)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 p-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5 v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                </button>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] text-slate-400 font-bold">{ev.date}</span>
                  <button onClick={() => toggleStatus(ev.id, ev.status)}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${ev.status === "未清算" ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{ev.status}</button>
                </div>
                {ev.data.map((d: any) => (
                  <div key={d.name} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <span className="text-slate-600 font-bold">{d.name}</span>
                    <span className={`font-mono font-bold ${d.amount >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{d.amount > 0 ? `+${d.amount.toLocaleString()}` : d.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'ranking' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase">
              <tr><th className="p-4">Rank</th><th className="p-4">Player</th><th className="p-4 text-right">Profit</th></tr>
            </thead>
            <tbody>
              {ranking.map((row, index) => (
                <tr key={row.name} className="border-b border-slate-50 last:border-0">
                  <td className="p-4 font-black text-slate-300">#{index + 1}</td>
                  <td className="p-4"><div className="font-bold text-slate-800">{row.name}</div><div className="text-[10px] text-slate-400">{row.games} games</div></td>
                  <td className={`p-4 text-right font-mono font-black ${row.total >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{row.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'master' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Player Master</h2>
          <div className="flex gap-2 mb-6">
            <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="名前を入力" 
              className="flex-1 p-2 border-2 border-slate-100 rounded-lg outline-none focus:border-indigo-400 text-slate-900 font-bold" />
            <button onClick={addMember} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold active:scale-95">追加</button>
          </div>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-800">{m}</span>
                <button onClick={() => deleteMember(m)} className="text-slate-300 hover:text-rose-500 p-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}