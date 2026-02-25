"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../app/lib/supabase';

export default function PokerApp() {
  const [activeTab, setActiveTab] = useState<'input' | 'ranking' | 'master'>('input');
  const [isEditMode, setIsEditMode] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [points, setPoints] = useState<Record<string, number>>({});
  const [inputModes, setInputModes] = useState<Record<string, 'pt' | 'yen'>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 期間フィルター
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 貸借メモ
  const [loans, setLoans] = useState<{from: string, to: string, amount: number}[]>([]);
  const [loanFrom, setLoanFrom] = useState('');
  const [loanTo, setLoanTo] = useState('');
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [isLoanApplied, setIsLoanApplied] = useState(false);

  // チップ計算・分割ポップアップ
  const [calcTarget, setCalcTarget] = useState<string | null>(null);
  const [allChipCounts, setAllChipCounts] = useState<Record<string, Record<string, number>>>({});
  const [initialStack, setInitialStack] = useState(30000);
  const [selectedLogItems, setSelectedLogItems] = useState<number[]>([]);
  const [splitModal, setSplitModal] = useState<{ show: boolean, targetItems: any[] } | null>(null);
  const [splitAmounts, setSplitAmounts] = useState<Record<number, number>>({});

  useEffect(() => {
    const saved = localStorage.getItem('poker_draft');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setSelectedIds(p.selectedIds || []);
        setPoints(p.points || {});
        setLoans(p.loans || []);
        setIsLoanApplied(p.isLoanApplied || false);
      } catch (e) { console.error(e); }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      const draft = { selectedIds, points, inputModes, loans, isLoanApplied, initialStack };
      localStorage.setItem('poker_draft', JSON.stringify(draft));
    }
  }, [selectedIds, points, inputModes, loans, isLoanApplied, initialStack, loading]);

  const fetchData = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from('players').select('name');
    if (pData) setMembers(pData.map(p => p.name));
    const { data: sData } = await supabase.from('sessions').select('*').order('created_at', { ascending: false });
    if (sData) {
      const grouped = sData.reduce((acc: any, curr: any) => {
        if (!acc[curr.event_id]) {
          acc[curr.event_id] = { id: curr.event_id, rawDate: curr.created_at, date: new Date(curr.created_at).toLocaleString('ja-JP'), data: [] };
        }
        acc[curr.event_id].data.push(curr);
        return acc;
      }, {});
      setEvents(Object.values(grouped));
    }
    setLoading(false);
  };

  const getRawPt = (name: string) => {
    const val = points[name] || 0;
    return (inputModes[name] || 'pt') === 'pt' ? val : val * 2;
  };

  const currentTotalInHand = useMemo(() => selectedIds.reduce((sum, id) => sum + getRawPt(id), 0), [selectedIds, points, inputModes]);
  const houseLoanSurplus = useMemo(() => loans.reduce((sum, l) => {
    if (l.from === '在庫' && l.to !== '在庫') return sum + l.amount;
    if (l.to === '在庫' && l.from !== '在庫') return sum - l.amount;
    return sum;
  }, 0), [loans]);
  const targetTotalWithHouse = (selectedIds.length * initialStack) + houseLoanSurplus;
  const totalDiff = currentTotalInHand - targetTotalWithHouse;

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
  };

  const openSplitModal = () => {
    const all = events.flatMap(ev => ev.data);
    const targets = all.filter(d => selectedLogItems.includes(d.id));
    setSplitModal({ show: true, targetItems: targets });
    const initials: Record<number, number> = {};
    targets.forEach(t => initials[t.id] = 0);
    setSplitAmounts(initials);
  };

  const confirmSplit = async () => {
    const sum = Object.values(splitAmounts).reduce((a, b) => a + b, 0);
    if (sum !== 0) return alert("合計を0にしてください");
    const newEventId = crypto.randomUUID();
    const splitRecords = splitModal!.targetItems.map(t => ({
      player_name: t.player_name, amount: splitAmounts[t.id], event_id: newEventId, status: "未精算"
    })).filter(r => r.amount !== 0);

    for (const item of splitModal!.targetItems) {
      const remaining = item.amount - splitAmounts[item.id];
      if (remaining === 0) await supabase.from('sessions').delete().eq('id', item.id);
      else await supabase.from('sessions').update({ amount: remaining }).eq('id', item.id);
    }
    if (splitRecords.length > 0) await supabase.from('sessions').insert(splitRecords);
    setSplitModal(null); setSelectedLogItems([]); fetchData();
  };

  if (loading) return <div className="p-10 text-center font-bold text-slate-400 tracking-tighter uppercase animate-pulse">Loading Database...</div>;

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-emerald-500 font-black tracking-widest flex items-center gap-1">● ONLINE</div>
        <button onClick={() => { if(!isEditMode){const pw=prompt("Pass"); if(pw==="poker999")setIsEditMode(true);}else setIsEditMode(false);}} className={`text-[10px] px-3 py-1 rounded-full border transition-all font-bold ${isEditMode ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-slate-400'}`}>
          {isEditMode ? '🔓 EDIT ON' : '🔒 EDIT OFF'}
        </button>
      </div>

      <div className="flex bg-white p-1 rounded-xl shadow-sm mb-6 border border-slate-100 font-bold">
        {['input', 'ranking', 'master'].map((t) => (
          <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 rounded-lg text-xs transition-all ${activeTab === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {t === 'input' ? '記録' : t === 'ranking' ? '順位' : '名簿'}
          </button>
        ))}
      </div>

      {activeTab === 'input' && (
        <>
          <div className={`p-4 rounded-2xl mb-6 border transition-all ${isLoanApplied && !isEditMode ? 'bg-slate-100' : 'bg-amber-50 border-amber-100 shadow-sm'}`}>
            <h2 className="text-[10px] font-black uppercase mb-3 text-amber-600">🤝 貸借メモ</h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={loanFrom} onChange={(e)=>setLoanFrom(e.target.value)} className="p-2 text-xs rounded-lg bg-white border-none outline-none"><option value="">貸した人</option><option value="在庫">📦 在庫</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select value={loanTo} onChange={(e)=>setLoanTo(e.target.value)} className="p-2 text-xs rounded-lg bg-white border-none outline-none"><option value="">借りた人</option><option value="在庫">📦 在庫</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
            </div>
            <div className="flex gap-2">
              <input type="number" placeholder="pt" value={loanAmount || ""} onChange={(e)=>setLoanAmount(parseInt(e.target.value)||0)} className="flex-1 p-2 text-xs rounded-lg border-none outline-none font-bold" />
              <button onClick={()=>{if(loanFrom&&loanTo&&loanAmount>0){setLoans([...loans,{from:loanFrom,to:loanTo,amount:loanAmount}]);setLoanAmount(0);}}} className="bg-amber-500 text-white px-4 rounded-lg text-xs font-bold">追加</button>
            </div>
            {loans.map((l, i) => (<div key={i} className="text-[10px] font-bold text-amber-700 flex justify-between mt-1 px-2">{l.from} → {l.to} : {l.amount}pt</div>))}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
            <h2 className="text-xs font-black text-slate-400 mb-4 uppercase flex justify-between items-center">チップ入力 <button onClick={()=>{if(confirm("リセット？")){setSelectedIds([]);setPoints({});setLoans([]);setIsLoanApplied(false);}}} className="text-rose-400 text-[9px] font-bold">クリア</button></h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {members.map(m => (<button key={m} onClick={() => setSelectedIds(prev => prev.includes(m) ? prev.filter(n => n !== m) : [...prev, m])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.includes(m) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>{m}</button>))}
            </div>
            {selectedIds.map(name => (
              <div key={name} className="flex flex-col mb-4 pb-4 border-b border-slate-50 last:border-0 text-slate-900">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm">{name}</span>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setInputModes({...inputModes, [name]: 'pt'})} className={`px-3 py-1 text-[10px] font-black rounded-md ${(inputModes[name] || 'pt') === 'pt' ? 'bg-white text-indigo-600' : 'text-slate-400'}`}>PT</button>
                    <button onClick={() => setInputModes({...inputModes, [name]: 'yen'})} className={`px-3 py-1 text-[10px] font-black rounded-md ${inputModes[name] === 'yen' ? 'bg-white text-emerald-600' : 'text-slate-400'}`}>円</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setCalcTarget(name)} className="p-2 bg-slate-100 rounded-lg text-slate-400">⌨</button>
                  <input type="number" value={points[name] || ""} onChange={(e)=>setPoints({...points,[name]:parseInt(e.target.value)||0})} className="flex-1 p-2 border border-slate-100 rounded-lg text-right font-mono font-bold" />
                </div>
              </div>
            ))}
            {selectedIds.length > 0 && (
              <button onClick={isLoanApplied ? async () => {
                const eventId = crypto.randomUUID();
                const insertData = selectedIds.map(name => ({ event_id: eventId, player_name: name, amount: getRawPt(name)/2, status: "清算済み" }));
                await supabase.from('sessions').insert(insertData);
                fetchData(); setSelectedIds([]); setPoints({}); setIsLoanApplied(false);
              } : applyDeductAndLoans} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black mt-2 shadow-lg active:scale-95 transition-all">
                {isLoanApplied ? (currentTotalInHand === 0 ? 'DBに保存' : `誤差 ${currentTotalInHand}pt`) : (totalDiff === 0 ? '収支に変換' : `あと ${totalDiff}pt`)}
              </button>
            )}
          </div>

          <div className="space-y-4 pb-32">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-black text-slate-400 uppercase">履歴</h2>
              {isEditMode && selectedLogItems.length > 0 && <button onClick={openSplitModal} className="bg-orange-500 text-white text-[10px] font-black px-4 py-2 rounded-lg shadow-lg animate-pulse">未精算切り出し</button>}
            </div>
            {events.map(ev => (
              <div key={ev.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-400">{ev.date}</span>
                  {ev.data.some((d: any) => d.status === "未精算") && <span className="bg-orange-100 text-orange-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">UNPAID</span>}
                </div>
                {ev.data.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0 font-bold">
                    <div className="flex items-center gap-2">
                      {isEditMode && <input type="checkbox" checked={selectedLogItems.includes(d.id)} onChange={()=>setSelectedLogItems(prev => prev.includes(d.id)?prev.filter(i=>i!==d.id):[...prev, d.id])} className="w-4 h-4 accent-orange-500" />}
                      <span className="text-slate-600">{d.player_name}</span>
                    </div>
                    <span className={d.amount >= 0 ? 'text-indigo-600' : 'text-rose-500'}>{d.amount.toLocaleString()}円</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'ranking' && (
        <div className="space-y-4 text-slate-900">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-2">
             <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold" />
             <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold" />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase"><th className="p-4">順位</th><th className="p-4">名前</th><th className="p-4 text-right">収支</th></tr></thead>
              <tbody>
                {Object.entries(events.reduce((acc: any, ev: any) => {
                  const evTime = new Date(ev.rawDate).getTime();
                  if (startDate && evTime < new Date(startDate).getTime()) return acc;
                  if (endDate && evTime > new Date(endDate).getTime()) return acc;
                  ev.data.forEach((d: any) => { acc[d.player_name] = (acc[d.player_name] || 0) + d.amount; });
                  return acc;
                }, {} as any)).sort((a: any, b: any) => b[1] - a[1]).map(([name, total]: any, index) => (
                  <tr key={name} className="border-b border-slate-50 last:border-0"><td className="p-4 font-black text-slate-300">#{index+1}</td><td className="p-4 font-bold">{name}</td><td className={`p-4 text-right font-mono font-black ${total>=0?'text-indigo-600':'text-rose-500'}`}>{total.toLocaleString()}円</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'master' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-slate-900">
          <div className="flex gap-2 mb-6">
            <input type="text" value={newMemberName} onChange={(e)=>setNewMemberName(e.target.value)} className="flex-1 p-2 border-2 border-slate-100 rounded-lg font-bold outline-none" placeholder="新しい名前" />
            <button onClick={async ()=>{if(!newMemberName)return; await supabase.from('players').insert([{name:newMemberName}]); setNewMemberName(''); fetchData();}} className="bg-indigo-600 text-white px-4 rounded-lg font-bold">追加</button>
          </div>
          <div className="space-y-2">
            {members.map(m=>(<div key={m} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 font-bold"><span>{m}</span>{isEditMode && <button onClick={async ()=>{if(confirm("削除？")){await supabase.from('players').delete().eq('name',m);fetchData();}}} className="text-slate-300 hover:text-rose-500">×</button>}</div>))}
          </div>
        </div>
      )}

      {/* モーダル群 */}
      {calcTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="font-black mb-6 text-slate-800">{calcTarget} さんの持ちチップ</h3>
            {['50','100','500','1000','5000'].map(val => (
              <div key={val} className="flex items-center justify-between mb-3 bg-slate-50 p-2 rounded-xl border border-slate-100 text-slate-900">
                <div className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center text-[10px] font-black text-indigo-500">{val}</div>
                <input type="number" value={(allChipCounts[calcTarget!]||{})[val]||""} placeholder="0" onChange={(e)=>{const current=allChipCounts[calcTarget!]||{}; setAllChipCounts({...allChipCounts,[calcTarget!]:{...current,[val]:parseInt(e.target.value)||0}})}} className="w-20 p-2 bg-white border-none rounded-lg text-right font-mono font-bold" />
              </div>
            ))}
            <button onClick={()=>{
              const current=allChipCounts[calcTarget!]||{}; const total=Object.entries(current).reduce((s,[v,c])=>s+(Number(v)*c),0);
              setPoints({...points,[calcTarget!]:total}); setCalcTarget(null);
            }} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">チップ量を確定</button>
          </div>
        </div>
      )}

      {splitModal?.show && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[120] flex items-center justify-center p-6 text-slate-900">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
            <h3 className="text-center font-black mb-6 uppercase tracking-widest text-sm">未精算分の金額を入力</h3>
            <div className="space-y-4 mb-8">
              {splitModal.targetItems.map(item => (
                <div key={item.id} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase"><span>{item.player_name} (今: {item.amount}円)</span></div>
                  <input type="number" value={splitAmounts[item.id]||""} onChange={(e)=>setSplitAmounts({...splitAmounts,[item.id]:parseInt(e.target.value)||0})} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-mono font-bold text-right outline-none" />
                </div>
              ))}
              <div className={`text-center py-2 rounded-lg text-[10px] font-black ${Object.values(splitAmounts).reduce((a,b)=>a+b,0)===0?'bg-emerald-50 text-emerald-600':'bg-rose-50 text-rose-500'}`}>合計誤差: {Object.values(splitAmounts).reduce((a,b)=>a+b,0)}円</div>
            </div>
            <button onClick={confirmSplit} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black shadow-lg mb-3">未精算データを作成</button>
            <button onClick={()=>setSplitModal(null)} className="w-full text-slate-400 font-bold text-xs uppercase">キャンセル</button>
          </div>
        </div>
      )}
    </div>
  );
}