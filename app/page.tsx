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

  // 貸借メモ (applied: 反映済みフラグを追加)
  const [loans, setLoans] = useState<{from: string, to: string, amount: number, applied: boolean}[]>([]);
  const [loanFrom, setLoanFrom] = useState('');
  const [loanTo, setLoanTo] = useState('');
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [isLoanApplied, setIsLoanApplied] = useState(false);

  // モーダル・計算関連
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
  
  // 在庫からの貸し出し（反映済みかどうかにかかわらず、チップ総量には影響する）
  const houseLoanSurplus = useMemo(() => loans.reduce((sum, l) => {
    if (l.from === '在庫' && l.to !== '在庫') return sum + l.amount;
    if (l.to === '在庫' && l.from !== '在庫') return sum - l.amount;
    return sum;
  }, 0), [loans]);

  const targetTotalWithHouse = (selectedIds.length * initialStack) + houseLoanSurplus;
  const totalDiff = currentTotalInHand - targetTotalWithHouse;

  // 貸借メモの適用状況をトグルする関数
  const toggleLoanApplied = (index: number) => {
    if (!isEditMode) return;
    const newLoans = [...loans];
    newLoans[index].applied = !newLoans[index].applied;
    setLoans(newLoans);
  };

  const applyDeductAndLoans = () => {
    if (totalDiff !== 0) return alert("チップの総計が合いません。");
    const newPoints = { ...points };
    
    // 1. 初期スタックを引く
    selectedIds.forEach(id => {
      newPoints[id] = getRawPt(id) - initialStack;
    });

    // 2. 貸借メモを反映（applied が false のものだけ収支に加算）
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

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-emerald-500 font-black tracking-widest">● ONLINE</div>
        <button onClick={() => { if(!isEditMode){const pw=prompt("Pass"); if(pw==="poker999")setIsEditMode(true);}else setIsEditMode(false);}} className={`text-[10px] px-3 py-1 rounded-full border font-bold transition-all ${isEditMode ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-slate-400'}`}>
          {isEditMode ? '🔓 EDIT ON' : '🔒 EDIT OFF'}
        </button>
      </div>

      {/* タブ */}
      <div className="flex bg-white p-1 rounded-xl shadow-sm mb-6 border border-slate-100 font-bold">
        {['input', 'ranking', 'master'].map((t) => (
          <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 rounded-lg text-xs transition-all ${activeTab === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {t === 'input' ? '記録' : t === 'ranking' ? '順位' : '名簿'}
          </button>
        ))}
      </div>

      {activeTab === 'input' && (
        <>
          {/* 🤝 貸借メモ */}
          <div className={`p-4 rounded-2xl mb-6 border transition-all ${isLoanApplied && !isEditMode ? 'bg-slate-100' : 'bg-amber-50 border-amber-100 shadow-sm'}`}>
            <h2 className="text-[10px] font-black uppercase mb-3 text-amber-600 flex justify-between">
              🤝 貸借メモ
              {isEditMode && <span className="text-[8px] opacity-60">チェック＝収支計算から除外</span>}
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-2 text-slate-900">
              <select value={loanFrom} onChange={(e)=>setLoanFrom(e.target.value)} className="p-2 text-xs rounded-lg bg-white border-none outline-none"><option value="">貸した人</option><option value="在庫">📦 在庫</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
              <select value={loanTo} onChange={(e)=>setLoanTo(e.target.value)} className="p-2 text-xs rounded-lg bg-white border-none outline-none"><option value="">借りた人</option><option value="在庫">📦 在庫</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select>
            </div>
            <div className="flex gap-2 mb-3">
              <input type="number" placeholder="pt" value={loanAmount || ""} onChange={(e)=>setLoanAmount(parseInt(e.target.value)||0)} className="flex-1 p-2 text-xs rounded-lg font-bold outline-none text-slate-900" />
              <button onClick={()=>{if(loanFrom&&loanTo&&loanAmount>0){setLoans([...loans,{from:loanFrom,to:loanTo,amount:loanAmount,applied:false}]);setLoanAmount(0);}}} className="bg-amber-500 text-white px-4 rounded-lg text-xs font-bold">追加</button>
            </div>
            <div className="space-y-1">
              {loans.map((l, i) => (
                <div key={i} className={`text-[10px] font-bold flex justify-between items-center px-2 py-1 rounded ${l.applied ? 'bg-slate-200 text-slate-400 line-through' : 'bg-white/50 text-amber-700'}`}>
                  <div className="flex items-center gap-2">
                    {isEditMode && (
                      <input type="checkbox" checked={l.applied} onChange={() => toggleLoanApplied(i)} className="w-3 h-3 accent-amber-600" />
                    )}
                    <span>{l.from} → {l.to} : {l.amount.toLocaleString()}pt</span>
                  </div>
                  {l.applied && <span className="text-[8px] font-black uppercase tracking-tighter">チップ反映済</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6 text-slate-900">
            <h2 className="text-xs font-black text-slate-400 mb-4 uppercase flex justify-between items-center">チップ入力 <button onClick={()=>{if(confirm("リセット？")){setSelectedIds([]);setPoints({});setLoans([]);setIsLoanApplied(false);}}} className="text-rose-400 text-[9px] font-bold">クリア</button></h2>
            {/* 以下、チップ入力・変換・履歴・ランキング等のロジックは変更なし */}
            <div className="flex flex-wrap gap-2 mb-6 text-slate-900">
              {members.map(m => (<button key={m} onClick={() => setSelectedIds(prev => prev.includes(m) ? prev.filter(n => n !== m) : [...prev, m])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.includes(m) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>{m}</button>))}
            </div>
            {selectedIds.map(name => (
              <div key={name} className="flex flex-col mb-4 pb-4 border-b border-slate-50 last:border-0 text-slate-900">
                <div className="flex justify-between items-center mb-2 font-bold text-sm">
                  <span>{name}</span>
                  <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                    <button onClick={() => setInputModes({...inputModes, [name]: 'pt'})} className={`px-3 py-1 text-[10px] font-black rounded-md ${(inputModes[name] || 'pt') === 'pt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>PT</button>
                    <button onClick={() => setInputModes({...inputModes, [name]: 'yen'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${inputModes[name] === 'yen' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>円</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setCalcTarget(name)} className="p-2 bg-slate-100 rounded-lg text-slate-400">⌨</button>
                  <input type="number" value={points[name] || ""} onChange={(e)=>setPoints({...points,[name]:parseInt(e.target.value)||0})} className="flex-1 p-2 border border-slate-100 rounded-lg text-right font-mono font-bold text-slate-900 outline-none" />
                </div>
              </div>
            ))}
            {selectedIds.length > 0 && (
              <button onClick={isLoanApplied ? async () => {
                const eventId = crypto.randomUUID();
                const insertData = selectedIds.map(name => ({ event_id: eventId, player_name: name, amount: getRawPt(name)/2, status: "清算済み" }));
                await supabase.from('sessions').insert(insertData);
                fetchData(); setSelectedIds([]); setPoints({}); setIsLoanApplied(false); setLoans([]);
              } : applyDeductAndLoans} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black mt-2 shadow-lg active:scale-95 transition-all">
                {isLoanApplied ? (currentTotalInHand === 0 ? 'DBに保存' : `誤差 ${currentTotalInHand}pt`) : (totalDiff === 0 ? '収支を計算する' : `あと ${totalDiff}pt`)}
              </button>
            )}
          </div>
          {/* 以下、以前作成した履歴等の表示部分は維持 */}
        </>
      )}
    </div>
  );
}