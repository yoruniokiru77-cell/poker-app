"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../app/lib/supabase';

export default function PokerApp() {
  const [activeTab, setActiveTab] = useState<'input' | 'ranking' | 'master'>('input');
  const [filterUnpaid, setFilterUnpaid] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [points, setPoints] = useState<Record<string, number>>({});
  const [inputModes, setInputModes] = useState<Record<string, 'pt' | 'yen'>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [loans, setLoans] = useState<{from: string, to: string, amount: number}[]>([]);
  const [loanFrom, setLoanFrom] = useState('');
  const [loanTo, setLoanTo] = useState('');
  const [loanAmount, setLoanAmount] = useState<number>(0);

  const [calcTarget, setCalcTarget] = useState<string | null>(null);
  const [allChipCounts, setAllChipCounts] = useState<Record<string, Record<string, number>>>({});
  const [initialStack, setInitialStack] = useState(30000);

  useEffect(() => {
    const savedData = localStorage.getItem('poker_draft');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setSelectedIds(parsed.selectedIds || []);
        setPoints(parsed.points || {});
        setInputModes(parsed.inputModes || {});
        setLoans(parsed.loans || []);
        setAllChipCounts(parsed.allChipCounts || {});
        setInitialStack(parsed.initialStack || 30000);
      } catch (e) {
        console.error("復元失敗", e);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      const draft = { selectedIds, points, inputModes, loans, allChipCounts, initialStack };
      localStorage.setItem('poker_draft', JSON.stringify(draft));
    }
  }, [selectedIds, points, inputModes, loans, allChipCounts, initialStack, loading]);

  const fetchData = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from('players').select('name');
    if (pData) setMembers(pData.map(p => p.name));
    const { data: sData } = await supabase.from('sessions').select('*').order('created_at', { ascending: false });
    if (sData) {
      const grouped = sData.reduce((acc: any, curr: any) => {
        if (!acc[curr.event_id]) {
          acc[curr.event_id] = { id: curr.event_id, rawDate: curr.created_at, date: new Date(curr.created_at).toLocaleString('ja-JP'), status: curr.status, data: [] };
        }
        acc[curr.event_id].data.push({ name: curr.player_name, amount: curr.amount });
        return acc;
      }, {});

      // 各イベント内のプレイヤーデータを金額の降順にソート
      const sortedEvents = Object.values(grouped).map((ev: any) => ({
        ...ev,
        data: ev.data.sort((a: any, b: any) => b.amount - a.amount)
      }));

      setEvents(sortedEvents);
    }
    setLoading(false);
  };

  const getFinalAmount = (name: string) => {
    const val = points[name] || 0;
    const mode = inputModes[name] || 'pt';
    return mode === 'pt' ? val / 2 : val;
  };

  const getFinalPoints = (name: string) => {
    const val = points[name] || 0;
    const mode = inputModes[name] || 'pt';
    return mode === 'pt' ? val : val * 2;
  };

  const totalDifferencePt = useMemo(() => {
    return selectedIds.reduce((sum, name) => sum + getFinalPoints(name), 0);
  }, [selectedIds, points, inputModes]);

  const filteredEvents = useMemo(() => {
    return filterUnpaid ? events.filter(ev => ev.status === "未清算") : events;
  }, [events, filterUnpaid]);

  const updateChipCount = (val: string, count: number) => {
    if (!calcTarget) return;
    const current = allChipCounts[calcTarget] || { "50": 0, "100": 0, "500": 0, "1000": 0, "5000": 0 };
    setAllChipCounts({ ...allChipCounts, [calcTarget]: { ...current, [val]: count } });
  };

  const applyChipCalc = () => {
    if (!calcTarget) return;
    const current = allChipCounts[calcTarget] || { "50": 0, "100": 0, "500": 0, "1000": 0, "5000": 0 };
    const totalCounted = Object.entries(current).reduce((sum, [val, count]) => sum + (Number(val) * count), 0);
    setPoints({ ...points, [calcTarget]: totalCounted - initialStack });
    setInputModes({ ...inputModes, [calcTarget]: 'pt' });
    setCalcTarget(null);
  };

  const addLoan = () => {
    if (!loanFrom || !loanTo || loanAmount <= 0) return;
    setLoans([...loans, { from: loanFrom, to: loanTo, amount: loanAmount }]);
    setLoanAmount(0);
  };

  const applyLoansToScore = () => {
    const newPoints = { ...points };
    const newInputModes = { ...inputModes };
    loans.forEach(loan => {
      if (loan.from !== '在庫') {
        const currentPt = getFinalPoints(loan.from);
        newPoints[loan.from] = currentPt + loan.amount;
        newInputModes[loan.from] = 'pt';
      }
      if (loan.to !== '在庫') {
        const currentPt = getFinalPoints(loan.to);
        newPoints[loan.to] = currentPt - loan.amount;
        newInputModes[loan.to] = 'pt';
      }
    });
    setPoints(newPoints);
    setInputModes(newInputModes);
    setLoans([]);
  };

  const ranking = useMemo(() => {
    const stats: Record<string, { total: number; games: number }> = {};
    events.forEach(ev => {
      const evTime = new Date(ev.rawDate).getTime();
      if (startDate && evTime < new Date(startDate).getTime()) return;
      if (endDate && evTime > new Date(endDate).setHours(23, 59, 59, 999)) return;
      ev.data.forEach((d: any) => {
        if (!stats[d.name]) stats[d.name] = { total: 0, games: 0 };
        stats[d.name].total += d.amount;
        stats[d.name].games += 1;
      });
    });
    return Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [events, startDate, endDate]);

  const toggleEditMode = () => {
    if (!isEditMode) {
      const pw = prompt("パスワードを入力してください");
      if (pw === "poker999") setIsEditMode(true);
      else if (pw !== null) alert("不一致");
    } else setIsEditMode(false);
  };

  const saveEvent = async () => {
    if (totalDifferencePt !== 0) return alert(`合計を0ptにしてください（現在 ${totalDifferencePt}pt）`);
    const eventId = crypto.randomUUID();
    const insertData = selectedIds.map(name => ({ event_id: eventId, player_name: name, amount: getFinalAmount(name), status: "清算済み" }));
    const { error } = await supabase.from('sessions').insert(insertData);
    if (error) alert("失敗");
    else { 
      alert("保存成功"); 
      fetchData(); 
      setSelectedIds([]); 
      setPoints({}); 
      setLoans([]); 
      setAllChipCounts({}); 
      localStorage.removeItem('poker_draft');
    }
  };

  const deleteMember = async (name: string) => {
    if (!isEditMode || !confirm("削除しますか？")) return;
    await supabase.from('players').delete().eq('name', name);
    fetchData();
  };

  const deleteEvent = async (eventId: string) => {
    if (!isEditMode || !confirm("削除しますか？")) return;
    await supabase.from('sessions').delete().eq('event_id', eventId);
    fetchData();
  };

  const toggleStatus = async (eventId: string, currentStatus: string) => {
    if (!isEditMode) return alert("要編集モード");
    const newStatus = currentStatus === "未清算" ? "清算済み" : "未清算";
    await supabase.from('sessions').update({ status: newStatus }).eq('event_id', eventId);
    fetchData();
  };

  const addMember = async () => {
    if (!newMemberName) return;
    const { error } = await supabase.from('players').insert([{ name: newMemberName }]);
    if (error) alert("エラー");
    else { setNewMemberName(''); fetchData(); }
  };

  if (loading) return <div className="p-10 text-center font-bold text-slate-400">読み込み中...</div>;

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen text-slate-900">
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-emerald-500 font-bold tracking-widest flex items-center gap-1">
          ● ONLINE <span className="text-slate-300 text-[8px] font-normal ml-2">AUTO SAVE ON</span>
        </div>
        <button onClick={toggleEditMode} className={`text-[10px] px-3 py-1 rounded-full border transition-all ${isEditMode ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>
          {isEditMode ? '🔓 EDIT ON' : '🔒 EDIT OFF'}
        </button>
      </div>

      <div className="flex bg-white p-1 rounded-xl shadow-sm mb-6 border border-slate-100">
        {(['input', 'ranking', 'master'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {tab === 'input' ? '記録' : tab === 'ranking' ? '順位' : '名簿'}
          </button>
        ))}
      </div>

      {activeTab === 'input' && (
        <>
          <div className="bg-amber-50 p-4 rounded-2xl mb-6 border border-amber-100 shadow-sm">
            <h2 className="text-[10px] font-black text-amber-600 uppercase mb-3 flex items-center gap-1">🤝 貸借メモ (反映先: pt)</h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={loanFrom} onChange={(e)=>setLoanFrom(e.target.value)} className="p-2 text-xs rounded-lg border-none bg-white outline-none">
                <option value="">貸した人</option><option value="在庫">📦 在庫</option>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={loanTo} onChange={(e)=>setLoanTo(e.target.value)} className="p-2 text-xs rounded-lg border-none bg-white outline-none">
                <option value="">借りた人</option><option value="在庫">📦 在庫</option>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-3">
              <input type="number" placeholder="ptを入力" value={loanAmount || ""} onChange={(e)=>setLoanAmount(parseInt(e.target.value)||0)} className="flex-1 p-2 text-xs rounded-lg border-none outline-none font-bold text-slate-900" />
              <button onClick={addLoan} className="bg-amber-500 text-white px-4 rounded-lg text-xs font-bold active:scale-95">追加</button>
            </div>
            {loans.length > 0 && (
              <div className="space-y-1">
                {loans.map((l, i) => (
                  <div key={i} className="text-[10px] font-bold text-amber-700 flex justify-between bg-white/50 p-1 px-2 rounded">
                    <span>{l.from} → {l.to}</span><span>{l.amount.toLocaleString()} pt</span>
                  </div>
                ))}
                <button onClick={applyLoansToScore} className="w-full mt-2 bg-white text-amber-600 py-2 rounded-lg text-[10px] font-black border border-amber-200 shadow-sm">収支(pt)に反映</button>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 border border-slate-100">
            <h2 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest flex justify-between">
              新規セッション
              {selectedIds.length > 0 && <button onClick={() => { if(confirm("内容をリセットしますか？")) { setSelectedIds([]); setPoints({}); setLoans([]); setAllChipCounts({}); localStorage.removeItem('poker_draft'); }}} className="text-[8px] text-rose-400 border border-rose-100 px-2 rounded-md">クリア</button>}
            </h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {members.map(m => (
                <button key={m} onClick={() => setSelectedIds(prev => prev.includes(m) ? prev.filter(n => n !== m) : [...prev, m])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.includes(m) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>{m}</button>
              ))}
            </div>
            {selectedIds.map(name => (
              <div key={name} className="flex flex-col mb-4 pb-4 border-b border-slate-50 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-700">{name}</span>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setInputModes({...inputModes, [name]: 'pt'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${(inputModes[name] || 'pt') === 'pt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>PT</button>
                    <button onClick={() => setInputModes({...inputModes, [name]: 'yen'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${inputModes[name] === 'yen' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>円</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(inputModes[name] || 'pt') === 'pt' && (
                    <button onClick={() => setCalcTarget(name)} className="p-2 bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">⌨</button>
                  )}
                  <input type="number" placeholder="0" value={points[name] || ""} onChange={(e) => setPoints({ ...points, [name]: parseInt(e.target.value) || 0 })} className="flex-1 p-2 border-2 border-slate-100 rounded-lg text-right outline-none font-mono font-bold text-slate-900 focus:border-indigo-400" />
                  <span className="text-xs font-bold text-slate-400 w-8">{(inputModes[name] || 'pt') === 'pt' ? 'pt' : '円'}</span>
                </div>
                {(inputModes[name] || 'pt') === 'pt' && <div className="text-[10px] text-right text-slate-400 font-bold mt-1 tracking-wider">金額換算: {(points[name] || 0) / 2} 円</div>}
              </div>
            ))}
            {selectedIds.length > 0 && (
              <div className={`mt-4 p-2 rounded-lg text-center font-bold text-xs transition-colors ${totalDifferencePt === 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-500 bg-rose-50'}`}>
                {totalDifferencePt === 0 ? '✓ 合計が0ptになりました' : `合計を0ptにしてください (現在: ${totalDifferencePt.toLocaleString()} pt)`}
              </div>
            )}
            <button onClick={saveEvent} disabled={selectedIds.length === 0} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black mt-4 disabled:bg-slate-200 active:scale-95 shadow-lg">DBに保存（清算）</button>
          </div>

          {calcTarget && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-slate-800">{calcTarget} さんの計算</h3>
                  <button onClick={() => setCalcTarget(null)} className="text-slate-400 text-2xl">&times;</button>
                </div>
                <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">初期スタック</span>
                    <span className="text-xs font-mono font-bold text-slate-600">{initialStack.toLocaleString()} pt</span>
                  </div>
                  <input type="range" min="0" max="100000" step="5000" value={initialStack} onChange={(e) => setInitialStack(parseInt(e.target.value))} className="w-full accent-indigo-600" />
                </div>
                <div className="space-y-3 mb-6">
                  {['50', '100', '500', '1000', '5000'].map(val => {
                    const currentCounts = allChipCounts[calcTarget!] || { "50": 0, "100": 0, "500": 0, "1000": 0, "5000": 0 };
                    return (
                      <div key={val} className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100 shadow-sm text-slate-900">
                        <div className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center text-[10px] font-black text-indigo-500">{val}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-300">枚</span>
                          <input type="number" value={currentCounts[val] || ""} placeholder="0" onChange={(e) => updateChipCount(val, parseInt(e.target.value) || 0)} className="w-20 p-2 bg-slate-50 border-transparent rounded-lg text-right font-mono font-bold outline-none focus:border-indigo-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={applyChipCalc} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg active:scale-95">反映</button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xs font-black text-slate-400 uppercase px-1">履歴</h2>
            {filteredEvents.map(ev => (
              <div key={ev.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative text-slate-900 animate-in fade-in duration-500">
                {isEditMode && <button onClick={() => deleteEvent(ev.id)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors">×</button>}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] text-slate-400 font-bold">{ev.date}</span>
                  <button onClick={() => toggleStatus(ev.id, ev.status)} className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${ev.status === "未清算" ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{ev.status}</button>
                </div>
                {ev.data.map((d: any) => (
                  <div key={d.name} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0 text-slate-900">
                    <span className="text-slate-600 font-bold">{d.name}</span>
                    <span className={`font-mono font-bold ${d.amount >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{d.amount.toLocaleString()}円</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'ranking' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest text-slate-900">期間指定フィルター</h2>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none" />
              <span>〜</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none" />
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase">
                <tr><th className="p-4">順位</th><th className="p-4">プレイヤー</th><th className="p-4 text-right">収支額</th></tr>
              </thead>
              <tbody>
                {ranking.map((row, index) => (
                  <tr key={row.name} className="border-b border-slate-50 last:border-0 text-slate-900">
                    <td className="p-4 font-black text-slate-300">#{index + 1}</td>
                    <td className="p-4 font-bold">{row.name}</td>
                    <td className={`p-4 text-right font-mono font-black ${row.total >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{row.total.toLocaleString()}円</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'master' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-slate-900">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 text-slate-900">名簿管理</h2>
          <div className="flex gap-2 mb-6">
            <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="名前を入力" className="flex-1 p-2 border-2 border-slate-100 rounded-lg font-bold outline-none" />
            <button onClick={addMember} className="bg-indigo-600 text-white px-4 rounded-lg font-bold shadow-md">追加</button>
          </div>
          <div className="space-y-2 text-slate-900">
            {members.map(m => (
              <div key={m} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 shadow-sm">
                <span className="font-bold">{m}</span>
                {isEditMode && <button onClick={() => deleteMember(m)} className="text-slate-300 hover:text-rose-500 transition-colors">×</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}