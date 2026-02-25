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

  const [checkedEventIds, setCheckedEventIds] = useState<string[]>([]);
  const [sumPopup, setSumPopup] = useState<{show: boolean, results: {name: string, total: number}[], details: string} | null>(null);

  // 貸借メモ関連
  const [loans, setLoans] = useState<{from: string, to: string, amount: number}[]>([]);
  const [loanFrom, setLoanFrom] = useState('');
  const [loanTo, setLoanTo] = useState('');
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [isLoanApplied, setIsLoanApplied] = useState(false);

  const [calcTarget, setCalcTarget] = useState<string | null>(null);
  const [allChipCounts, setAllChipCounts] = useState<Record<string, Record<string, number>>>({});
  const [initialStack, setInitialStack] = useState(30000);

  // データ復元と取得
  useEffect(() => {
    const savedData = localStorage.getItem('poker_draft');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setSelectedIds(parsed.selectedIds || []);
        setPoints(parsed.points || {});
        setInputModes(parsed.inputModes || {});
        setLoans(parsed.loans || []);
        setIsLoanApplied(parsed.isLoanApplied || false);
        setAllChipCounts(parsed.allChipCounts || {});
        setInitialStack(parsed.initialStack || 30000);
      } catch (e) { console.error(e); }
    }
    fetchData();
  }, []);

  // 自動保存
  useEffect(() => {
    if (!loading) {
      const draft = { selectedIds, points, inputModes, loans, isLoanApplied, allChipCounts, initialStack };
      localStorage.setItem('poker_draft', JSON.stringify(draft));
    }
  }, [selectedIds, points, inputModes, loans, isLoanApplied, allChipCounts, initialStack, loading]);

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
      setEvents(Object.values(grouped).map((ev: any) => ({ ...ev, data: ev.data.sort((a: any, b: any) => b.amount - a.amount) })));
    }
    setLoading(false);
  };

  const getRawPt = (name: string) => {
    const val = points[name] || 0;
    return (inputModes[name] || 'pt') === 'pt' ? val : val * 2;
  };

  // --- 計算ロジック ---
  const currentTotalInHand = useMemo(() => selectedIds.reduce((sum, id) => sum + getRawPt(id), 0), [selectedIds, points, inputModes]);
  const houseLoanSurplus = useMemo(() => loans.reduce((sum, loan) => {
      if (loan.from === '在庫' && loan.to !== '在庫') return sum + loan.amount;
      if (loan.to === '在庫' && loan.from !== '在庫') return sum - loan.amount;
      return sum;
  }, 0), [loans]);

  const targetTotalWithHouse = useMemo(() => (selectedIds.length * initialStack) + houseLoanSurplus, [selectedIds.length, initialStack, houseLoanSurplus]);
  const totalDiff = currentTotalInHand - targetTotalWithHouse;

  // --- アクション関数群 ---

  const applyChipCalc = () => {
    if (!calcTarget) return;
    const current = allChipCounts[calcTarget] || { "50": 0, "100": 0, "500": 0, "1000": 0, "5000": 0 };
    const total = Object.entries(current).reduce((sum, [v, c]) => sum + (Number(v) * c), 0);
    setPoints({ ...points, [calcTarget]: total });
    setInputModes({ ...inputModes, [calcTarget]: 'pt' });
    setCalcTarget(null);
  };

  const updateChipCount = (val: string, count: number) => {
    if (!calcTarget) return;
    const current = allChipCounts[calcTarget] || { "50": 0, "100": 0, "500": 0, "1000": 0, "5000": 0 };
    setAllChipCounts({ ...allChipCounts, [calcTarget]: { ...current, [val]: count } });
  };

  const addLoan = () => {
    if (!loanFrom || !loanTo || loanAmount <= 0) return;
    setLoans([...loans, { from: loanFrom, to: loanTo, amount: loanAmount }]);
    setLoanAmount(0);
  };

  const applyDeductAndLoans = () => {
    if (totalDiff !== 0) return alert("不整合です");
    const newPoints = { ...points };
    selectedIds.forEach(id => { newPoints[id] = getRawPt(id) - initialStack; });
    loans.forEach(loan => {
      if (loan.from !== '在庫') newPoints[loan.from] = (newPoints[loan.from] || 0) + loan.amount;
      if (loan.to !== '在庫') newPoints[loan.to] = (newPoints[loan.to] || 0) - loan.amount;
    });
    setPoints(newPoints);
    setInputModes(Object.fromEntries(selectedIds.map(id => [id, 'pt'])));
    setIsLoanApplied(true);
    alert("収支変換完了。合計が0ptか確認してください。");
  };

  const saveEvent = async () => {
    const finalSum = selectedIds.reduce((sum, id) => sum + getRawPt(id), 0);
    if (finalSum !== 0) return alert(`合計が ${finalSum}pt です。0にしてください。`);
    const eventId = crypto.randomUUID();
    const insertData = selectedIds.map(name => ({ event_id: eventId, player_name: name, amount: getRawPt(name) / 2, status: "清算済み" }));
    const { error } = await supabase.from('sessions').insert(insertData);
    if (!error) {
      alert("保存成功"); fetchData(); setSelectedIds([]); setPoints({}); setLoans([]); setIsLoanApplied(false); setAllChipCounts({});
      localStorage.removeItem('poker_draft');
    }
  };

  const toggleEditMode = () => {
    if (!isEditMode) {
      const pw = prompt("パスワード");
      if (pw === "poker999") setIsEditMode(true);
    } else setIsEditMode(false);
  };

  const deleteMember = async (name: string) => {
    if (!isEditMode || !confirm("削除？")) return;
    await supabase.from('players').delete().eq('name', name);
    fetchData();
  };

  const addMember = async () => {
    if (!newMemberName) return;
    const { error } = await supabase.from('players').insert([{ name: newMemberName }]);
    if (!error) { setNewMemberName(''); fetchData(); }
  };

  if (loading) return <div className="p-10 text-center text-slate-400 font-bold">読み込み中...</div>;

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen text-slate-900">
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-emerald-500 font-bold tracking-widest">● ONLINE</div>
        <button onClick={toggleEditMode} className={`text-[10px] px-3 py-1 rounded-full border ${isEditMode ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-400'}`}>{isEditMode ? '🔓 EDIT ON' : '🔒 EDIT OFF'}</button>
      </div>

      <div className="flex bg-white p-1 rounded-xl shadow-sm mb-6 border border-slate-100">
        {['input', 'ranking', 'master'].map((t) => (
          <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${activeTab === t ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>{t === 'input' ? '記録' : t === 'ranking' ? '順位' : '名簿'}</button>
        ))}
      </div>

      {activeTab === 'input' && (
        <>
          <div className={`p-4 rounded-2xl mb-6 border transition-all ${isLoanApplied && !isEditMode ? 'bg-slate-100' : 'bg-amber-50 border-amber-100'}`}>
            <h2 className={`text-[10px] font-black uppercase mb-3 ${isLoanApplied && !isEditMode ? 'text-slate-400' : 'text-amber-600'}`}>🤝 貸借メモ</h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select disabled={isLoanApplied && !isEditMode} value={loanFrom} onChange={(e)=>setLoanFrom(e.target.value)} className="p-2 text-xs rounded-lg bg-white border-none outline-none">
                <option value="">貸した人</option><option value="在庫">📦 在庫</option>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select disabled={isLoanApplied && !isEditMode} value={loanTo} onChange={(e)=>setLoanTo(e.target.value)} className="p-2 text-xs rounded-lg bg-white border-none outline-none">
                <option value="">借りた人</option><option value="在庫">📦 在庫</option>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-3">
              <input disabled={isLoanApplied && !isEditMode} type="number" placeholder="pt入力" value={loanAmount || ""} onChange={(e)=>setLoanAmount(parseInt(e.target.value)||0)} className="flex-1 p-2 text-xs rounded-lg border-none" />
              <button disabled={isLoanApplied && !isEditMode} onClick={addLoan} className="bg-amber-500 text-white px-4 rounded-lg text-xs font-bold shadow-sm">追加</button>
            </div>
            {loans.length > 0 && (
              <div className="space-y-1">
                {loans.map((l, i) => (
                  <div key={i} className={`text-[10px] font-bold flex justify-between p-1.5 px-3 rounded ${isLoanApplied && !isEditMode ? 'text-slate-300' : 'text-amber-700 bg-white/60'}`}>
                    <span>{l.from} → {l.to}</span><span>{l.amount.toLocaleString()} pt</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-xs font-black text-slate-400 mb-4 tracking-widest uppercase">チップ入力</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {members.map(m => (
                <button key={m} onClick={() => setSelectedIds(prev => prev.includes(m) ? prev.filter(n => n !== m) : [...prev, m])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.includes(m) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{m}</button>
              ))}
            </div>
            {selectedIds.map(name => (
              <div key={name} className="flex flex-col mb-4 pb-4 border-b border-slate-50 last:border-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-slate-700">{name}</span>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setInputModes({...inputModes, [name]: 'pt'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${(inputModes[name] || 'pt') === 'pt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>PT</button>
                    <button onClick={() => setInputModes({...inputModes, [name]: 'yen'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${inputModes[name] === 'yen' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>円</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(inputModes[name] || 'pt') === 'pt' && <button onClick={() => setCalcTarget(name)} className="p-2 bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">⌨</button>}
                  <input type="number" value={points[name] || ""} onChange={(e) => setPoints({ ...points, [name]: parseInt(e.target.value) || 0 })} className="flex-1 p-2 border-2 border-slate-100 rounded-lg text-right font-mono font-bold" />
                  <span className="text-xs font-bold text-slate-400 w-8">{(inputModes[name] || 'pt') === 'pt' ? 'pt' : '円'}</span>
                </div>
              </div>
            ))}
            {selectedIds.length > 0 && (
              <div className="mt-6 space-y-3">
                {totalDiff === 0 ? (
                  <button onClick={applyDeductAndLoans} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg animate-pulse">収支に変換 (初期+在庫反映)</button>
                ) : (
                  <div className="p-3 bg-rose-50 text-rose-500 rounded-xl text-center font-bold text-xs">あと {totalDiff > 0 ? '-' : '+'}{Math.abs(totalDiff).toLocaleString()} pt で整合</div>
                )}
                <button onClick={saveEvent} disabled={currentTotalInHand !== 0 && !isLoanApplied} className={`w-full py-4 rounded-xl font-black shadow-lg ${currentTotalInHand === 0 && selectedIds.length > 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-300'}`}>DBに保存（清算）</button>
              </div>
            )}
          </div>
        </>
      )}

      {calcTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="font-black mb-6">{calcTarget} さんの持っているチップ</h3>
            <div className="space-y-3 mb-6">
              {['50', '100', '500', '1000', '5000'].map(val => (
                <div key={val} className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100 shadow-sm text-slate-900">
                  <div className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center text-[10px] font-black text-indigo-500">{val}</div>
                  <input type="number" value={(allChipCounts[calcTarget!] || {})[val] || ""} placeholder="0" onChange={(e) => updateChipCount(val, parseInt(e.target.value) || 0)} className="w-20 p-2 bg-slate-50 border-transparent rounded-lg text-right font-mono font-bold outline-none" />
                </div>
              ))}
            </div>
            <button onClick={applyChipCalc} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black">枚数を確定</button>
          </div>
        </div>
      )}

      {activeTab === 'ranking' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 bg-slate-50 rounded-lg outline-none" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 bg-slate-50 rounded-lg outline-none" />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-slate-900">
            <table className="w-full text-left">
              <thead><tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase"><th className="p-4">順位</th><th className="p-4">プレイヤー</th><th className="p-4 text-right">収支</th></tr></thead>
              <tbody>
                {events.reduce((acc: any, ev: any) => {
                    const evTime = new Date(ev.rawDate).getTime();
                    if (startDate && evTime < new Date(startDate).getTime()) return acc;
                    if (endDate && evTime > new Date(endDate).setHours(23, 59, 59, 999)) return acc;
                    ev.data.forEach((d: any) => {
                        if (!acc[d.name]) acc[d.name] = { total: 0 };
                        acc[d.name].total += d.amount;
                    });
                    return acc;
                }, {} as any) && Object.entries(events.reduce((acc: any, ev: any) => {
                    const evTime = new Date(ev.rawDate).getTime();
                    if (startDate && evTime < new Date(startDate).getTime()) return acc;
                    if (endDate && evTime > new Date(endDate).setHours(23, 59, 59, 999)) return acc;
                    ev.data.forEach((d: any) => { if (!acc[d.name]) acc[d.name] = { total: 0 }; acc[d.name].total += d.amount; });
                    return acc;
                }, {} as any)).sort((a:any, b:any) => b[1].total - a[1].total).map(([name, data]: any, index) => (
                  <tr key={name} className="border-b border-slate-50 last:border-0"><td className="p-4 font-black text-slate-300">#{index+1}</td><td className="p-4 font-bold">{name}</td><td className={`p-4 text-right font-mono font-bold ${data.total >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{data.total.toLocaleString()}円</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'master' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-slate-900">
          <div className="flex gap-2 mb-6 text-slate-900">
            <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="名前入力" className="flex-1 p-2 border-2 border-slate-100 rounded-lg font-bold" />
            <button onClick={addMember} className="bg-indigo-600 text-white px-4 rounded-lg font-bold shadow-md">追加</button>
          </div>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 text-slate-900"><span className="font-bold">{m}</span>{isEditMode && <button onClick={() => deleteMember(m)} className="text-slate-300 hover:text-rose-500 transition-colors">×</button>}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}