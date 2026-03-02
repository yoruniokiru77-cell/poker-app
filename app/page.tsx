"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../app/lib/supabase';

export default function PokerApp() {
  const [activeTab, setActiveTab] = useState<'input' | 'ranking' | 'master'>('input');
  const [isEditMode, setIsEditMode] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [points, setPoints] = useState<Record<string, number>>({});
  const [inputModes, setInputModes] = useState<Record<string, 'pt' | 'yen'>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [loans, setLoans] = useState<{from: string, to: string, amount: number, applied: boolean}[]>([]);
  const [loanFrom, setLoanFrom] = useState('');
  const [loanTo, setLoanTo] = useState('');
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [isLoanApplied, setIsLoanApplied] = useState(false);

  const [initialStack, setInitialStack] = useState(30000); // ★ここを画面で変更可能に
  const [calcTarget, setCalcTarget] = useState<string | null>(null);
  const [allChipCounts, setAllChipCounts] = useState<Record<string, Record<string, number>>>({});
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
        setInitialStack(p.initialStack ?? 30000); // 保存された設定を読み込む
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
    const val = points[name] ?? 0;
    return (inputModes[name] || 'pt') === 'pt' ? val : val * 2;
  };

  // --- 計算ロジック ---
  const currentTotalInHand = useMemo(() => selectedIds.reduce((sum, id) => sum + getRawPt(id), 0), [selectedIds, points, inputModes]);
  const houseLoanSurplus = useMemo(() => loans.reduce((sum, l) => {
    if (l.from === '在庫' && l.to !== '在庫') return sum + l.amount;
    if (l.to === '在庫' && l.from !== '在庫') return sum - l.amount;
    return sum;
  }, 0), [loans]);

  // あるべき合計チップ量 = (人数 * 初期スタック) + 在庫からの貸し出し
  const targetTotalWithHouse = (selectedIds.length * initialStack) + houseLoanSurplus;
  const totalDiff = currentTotalInHand - targetTotalWithHouse;

  const applyDeductAndLoans = () => {
    if (totalDiff !== 0) return alert("チップの合計が一致していません。");
    const newPoints = { ...points };
    selectedIds.forEach(id => {
      newPoints[id] = getRawPt(id) - initialStack;
    });
    loans.forEach(loan => {
      if (!loan.applied) {
        if (loan.from !== '在庫') newPoints[loan.from] = (newPoints[loan.from] || 0) + loan.amount;
        if (loan.to !== '在庫') newPoints[loan.to] = (newPoints[loan.to] || 0) - loan.amount;
      }
    });
    setPoints(newPoints);
    setInputModes(Object.fromEntries(selectedIds.map(id => [id, 'pt'])));
    setIsLoanApplied(true);
  };

  const handleClear = () => {
    if(confirm("すべての入力をリセットしますか？")) {
      setSelectedIds([]); setPoints({}); setLoans([]); setIsLoanApplied(false);
      setInitialStack(30000); // リセット時に3万に戻す
      localStorage.removeItem('poker_draft');
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <div className="flex justify-between items-center mb-4 text-slate-400">
        <div className="text-[10px] font-black tracking-widest uppercase">● Online Session</div>
        <button onClick={() => { if(!isEditMode){const pw=prompt("Pass"); if(pw==="poker999")setIsEditMode(true);}else setIsEditMode(false);}} className={`text-[10px] px-3 py-1 rounded-full border font-bold transition-all ${isEditMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white'}`}>
          {isEditMode ? '🔓 Edit Mode' : '🔒 Read Only'}
        </button>
      </div>

      {/* 初期スタック設定 (不整合の原因を確認・修正できる場所) */}
      <div className="bg-white p-4 rounded-2xl mb-4 border border-slate-100 shadow-sm flex items-center justify-between">
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">初期スタック</span>
        <div className="flex items-center gap-2">
          <input type="number" value={initialStack} onChange={(e)=>setInitialStack(parseInt(e.target.value)||0)} className="w-20 p-1 text-right font-mono font-bold bg-slate-50 rounded border-none outline-none" />
          <span className="text-[10px] font-bold text-slate-400">pt</span>
        </div>
      </div>

      <div className="flex bg-white p-1 rounded-xl shadow-sm mb-6 border border-slate-100 font-bold">
        {['input', 'ranking', 'master'].map((t) => (
          <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 rounded-lg text-xs transition-all ${activeTab === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{t === 'input' ? '記録' : t === 'ranking' ? '順位' : '名簿'}</button>
        ))}
      </div>

      {activeTab === 'input' && (
        <>
          {/* 🤝 貸借メモ */}
          <div className={`p-4 rounded-2xl mb-6 border transition-all ${isLoanApplied ? 'bg-slate-100' : 'bg-amber-50 border-amber-100'}`}>
            <h2 className="text-[10px] font-black uppercase mb-3 text-amber-600">🤝 貸借メモ</h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={loanFrom} onChange={(e)=>setLoanFrom(e.target.value)} className="p-2 text-xs rounded-lg bg-white outline-none border-none"><option value="">貸した人</option><option value="在庫">📦 在庫</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select value={loanTo} onChange={(e)=>setLoanTo(e.target.value)} className="p-2 text-xs rounded-lg bg-white outline-none border-none"><option value="">借りた人</option><option value="在庫">📦 在庫</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
            </div>
            <div className="flex gap-2 mb-3">
              <input type="number" placeholder="pt" value={loanAmount || ""} onChange={(e)=>setLoanAmount(parseInt(e.target.value)||0)} className="flex-1 p-2 text-xs rounded-lg font-bold outline-none text-slate-900" />
              <button onClick={()=>{if(loanFrom&&loanTo&&loanAmount>0){setLoans([...loans,{from:loanFrom,to:loanTo,amount:loanAmount,applied:false}]);setLoanAmount(0);}}} className="bg-amber-500 text-white px-4 rounded-lg text-xs font-bold">追加</button>
            </div>
            <div className="space-y-1">
              {loans.map((l, i) => (
                <div key={i} className={`text-[10px] font-bold flex justify-between items-center px-2 py-1 rounded ${l.applied ? 'bg-slate-200 text-slate-400' : 'bg-white/50 text-amber-700'}`}>
                  <div className="flex items-center gap-2">
                    {isEditMode && <input type="checkbox" checked={l.applied} onChange={() => {const n=[...loans]; n[i].applied=!n[i].applied; setLoans(n);}} className="w-3 h-3 accent-amber-600" />}
                    <span>{l.from} → {l.to} : {l.amount.toLocaleString()}pt</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6 text-slate-900">
            <h2 className="text-xs font-black text-slate-400 mb-4 uppercase flex justify-between items-center">チップ入力 <button onClick={handleClear} className="text-rose-400 text-[9px] font-bold">すべてクリア</button></h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {members.map(m => (<button key={m} onClick={() => setSelectedIds(prev => prev.includes(m) ? prev.filter(n => n !== m) : [...prev, m])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.includes(m) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>{m}</button>))}
            </div>
            {selectedIds.map(name => (
              <div key={name} className="flex flex-col mb-4 pb-4 border-b border-slate-50 last:border-0">
                <div className="flex justify-between items-center mb-2 font-bold text-sm">
                  <span>{name}</span>
                  <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                    <button onClick={() => setInputModes({...inputModes, [name]: 'pt'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${(inputModes[name] || 'pt') === 'pt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>PT</button>
                    <button onClick={() => setInputModes({...inputModes, [name]: 'yen'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${inputModes[name] === 'yen' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>円</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setCalcTarget(name)} className="p-2 bg-slate-100 rounded-lg text-slate-400">⌨</button>
                  <input type="number" value={points[name] === undefined ? "" : points[name]} onChange={(e)=>setPoints({...points,[name]:e.target.value==="" ? 0 : parseInt(e.target.value)})} className="flex-1 p-2 border border-slate-100 rounded-lg text-right font-mono font-bold outline-none" />
                </div>
              </div>
            ))}
            {selectedIds.length > 0 && (
              <div className="mt-4">
                <button onClick={isLoanApplied ? async () => {
                  if(currentTotalInHand !== 0) return alert("合計を0にしてください");
                  const eventId = crypto.randomUUID();
                  const insertData = selectedIds.map(name => ({ event_id: eventId, player_name: name, amount: getRawPt(name)/2, status: "清算済み" }));
                  await supabase.from('sessions').insert(insertData);
                  fetchData(); setSelectedIds([]); setPoints({}); setIsLoanApplied(false); setLoans([]);
                } : applyDeductAndLoans} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black shadow-lg active:scale-95 transition-all">
                  {isLoanApplied ? (currentTotalInHand === 0 ? 'DBに保存' : `誤差 ${currentTotalInHand}pt`) : (totalDiff === 0 ? '変換' : `あと ${totalDiff.toLocaleString()}pt`)}
                </button>
                
                {/* 誤差の内訳を表示 (デバッグ用) */}
                {!isLoanApplied && totalDiff !== 0 && (
                   <div className="mt-2 text-[9px] text-slate-400 text-center font-bold uppercase tracking-widest bg-slate-50 p-2 rounded-lg">
                     入力合計: {currentTotalInHand.toLocaleString()} / 目標: {targetTotalWithHouse.toLocaleString()}
                   </div>
                )}
              </div>
            )}
          </div>
          {/* 履歴等は以下に続く... (省略なしで貼り付けてください) */}
        </>
      )}
    </div>
  );
}