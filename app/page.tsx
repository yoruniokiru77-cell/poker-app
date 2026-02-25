"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../app/lib/supabase';

export default function PokerApp() {
  const [activeTab, setActiveTab] = useState<'input' | 'ranking' | 'master'>('input');
  const [isEditMode, setIsEditMode] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [unpaidSelected, setUnpaidSelected] = useState<string[]>([]); // 未精算として保存する人のチェック用
  const [points, setPoints] = useState<Record<string, number>>({});
  const [inputModes, setInputModes] = useState<Record<string, 'pt' | 'yen'>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [checkedEventIds, setCheckedEventIds] = useState<string[]>([]);
  const [sumPopup, setSumPopup] = useState<{show: boolean, results: {name: string, total: number}[], details: string} | null>(null);

  const [loans, setLoans] = useState<{from: string, to: string, amount: number}[]>([]);
  const [loanFrom, setLoanFrom] = useState('');
  const [loanTo, setLoanTo] = useState('');
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [isLoanApplied, setIsLoanApplied] = useState(false);

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
        setIsLoanApplied(parsed.isLoanApplied || false);
      } catch (e) { console.error(e); }
    }
    fetchData();
  }, []);

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
        acc[curr.event_id].data.push({ name: curr.player_name, amount: curr.amount, status: curr.status });
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

  const currentTotalInHand = useMemo(() => selectedIds.reduce((sum, id) => sum + getRawPt(id), 0), [selectedIds, points, inputModes]);
  const houseLoanSurplus = useMemo(() => loans.reduce((sum, loan) => {
      if (loan.from === '在庫' && loan.to !== '在庫') return sum + loan.amount;
      if (loan.to === '在庫' && loan.from !== '在庫') return sum - loan.amount;
      return sum;
  }, 0), [loans]);

  const targetTotalWithHouse = useMemo(() => (selectedIds.length * initialStack) + houseLoanSurplus, [selectedIds.length, initialStack, houseLoanSurplus]);
  const totalDiff = currentTotalInHand - targetTotalWithHouse;

  // ★「保存対象（未精算チェックを入れた人）」の収支合計を計算
  const selectedUnpaidTotal = useMemo(() => unpaidSelected.reduce((sum, id) => sum + getRawPt(id), 0), [unpaidSelected, points, inputModes]);

  const applyDeductAndLoans = () => {
    if (totalDiff !== 0) return alert("チップの合計が一致していません。");
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

  const saveEvent = async () => {
    if (unpaidSelected.length === 0) return alert("保存する人をチェックしてください（未精算者選択）");
    if (selectedUnpaidTotal !== 0) return alert(`チェックした人の合計が ${selectedUnpaidTotal}pt です。0ptにする必要があります。`);
    
    const eventId = crypto.randomUUID();
    // チェックされた人だけを「未精算」として保存、それ以外（もし選んでいれば）は「清算済み」
    const insertData = unpaidSelected.map(name => ({
      event_id: eventId,
      player_name: name,
      amount: getRawPt(name) / 2,
      status: "未精算"
    }));

    const { error } = await supabase.from('sessions').insert(insertData);
    if (!error) {
      alert("未精算データとして保存しました");
      fetchData(); setSelectedIds([]); setUnpaidSelected([]); setPoints({}); setLoans([]); setIsLoanApplied(false);
      localStorage.removeItem('poker_draft');
    }
  };

  const handleClear = () => {
    if(confirm("すべてリセットしますか？")) {
      setSelectedIds([]); setUnpaidSelected([]); setPoints({}); setLoans([]); setIsLoanApplied(false);
      localStorage.removeItem('poker_draft');
    }
  };

  const toggleEditMode = () => {
    if (!isEditMode) {
      const pw = prompt("パスワード");
      if (pw === "poker999") setIsEditMode(true);
    } else setIsEditMode(false);
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen text-slate-900">
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-emerald-500 font-bold tracking-widest">● ONLINE</div>
        <button onClick={toggleEditMode} className={`text-[10px] px-3 py-1 rounded-full border ${isEditMode ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-slate-400'}`}>
          {isEditMode ? '🔓 EDIT ON (未精算選択可)' : '🔒 EDIT OFF'}
        </button>
      </div>

      <div className="flex bg-white p-1 rounded-xl shadow-sm mb-6 border border-slate-100">
        {['input', 'ranking', 'master'].map((t) => (
          <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${activeTab === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {t === 'input' ? '記録' : t === 'ranking' ? '順位' : '名簿'}
          </button>
        ))}
      </div>

      {activeTab === 'input' && (
        <>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-slate-900 mb-6">
            <h2 className="text-xs font-black text-slate-400 mb-4 uppercase flex justify-between items-center">
              入力・精算管理
              <button onClick={handleClear} className="text-[10px] text-rose-400 font-bold px-3 py-1 rounded-lg bg-rose-50/30 border border-rose-100">クリア</button>
            </h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {members.map(m => (
                <button key={m} onClick={() => setSelectedIds(prev => prev.includes(m) ? prev.filter(n => n !== m) : [...prev, m])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.includes(m) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>{m}</button>
              ))}
            </div>

            {selectedIds.map(name => (
              <div key={name} className="flex flex-col mb-4 pb-4 border-b border-slate-50 last:border-0">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    {/* ★編集モードのときだけ表示される未精算チェック */}
                    {isEditMode && (
                      <input type="checkbox" checked={unpaidSelected.includes(name)} onChange={() => setUnpaidSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])} className="w-4 h-4 accent-orange-500" />
                    )}
                    <span className="font-bold text-slate-700">{name}</span>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setInputModes({...inputModes, [name]: 'pt'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${(inputModes[name] || 'pt') === 'pt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>PT</button>
                    <button onClick={() => setInputModes({...inputModes, [name]: 'yen'})} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${inputModes[name] === 'yen' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>円</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={points[name] || ""} onChange={(e) => setPoints({ ...points, [name]: parseInt(e.target.value) || 0 })} className="flex-1 p-2 border-2 border-slate-100 rounded-lg text-right font-mono font-bold" />
                </div>
              </div>
            ))}
            
            {selectedIds.length > 0 && (
              <div className="mt-6 space-y-3">
                {!isLoanApplied ? (
                  <button disabled={totalDiff !== 0} onClick={applyDeductAndLoans} className={`w-full py-4 rounded-xl font-black shadow-lg ${totalDiff === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {totalDiff === 0 ? '収支に変換' : `あと ${totalDiff > 0 ? '-' : '+'}${Math.abs(totalDiff).toLocaleString()} pt`}
                  </button>
                ) : (
                  <>
                    <button onClick={saveEvent} className={`w-full py-4 rounded-xl font-black shadow-lg transition-all ${selectedUnpaidTotal === 0 && unpaidSelected.length > 0 ? 'bg-orange-500 text-white' : 'bg-rose-500 text-white'}`}>
                      {unpaidSelected.length === 0 ? '保存する人をチェックしてください' : (selectedUnpaidTotal === 0 ? '未精算として保存' : `チェックした人の合計を0にして (${selectedUnpaidTotal > 0 ? '-' : '+'}${Math.abs(selectedUnpaidTotal).toLocaleString()}pt)`)}
                    </button>
                    <button onClick={() => setIsLoanApplied(false)} className="w-full py-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center border border-dashed border-slate-200 rounded-xl mt-2">修正する</button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 履歴セクション */}
          <div className="space-y-4 pb-24 mt-8">
            <h2 className="text-xs font-black text-slate-400 uppercase px-1">履歴</h2>
            {events.map(ev => (
              <div key={ev.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400">{ev.date}</span>
                  {/* ★未精算ラベルの復活 */}
                  {ev.data.some((d: any) => d.status === "未精算") && (
                    <span className="bg-orange-100 text-orange-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">UNPAID</span>
                  )}
                </div>
                {ev.data.map((d: any) => (
                  <div key={d.name} className="flex justify-between text-sm py-1 font-bold">
                    <span className="text-slate-600">{d.name}</span>
                    <span className={d.amount >= 0 ? 'text-indigo-600' : 'text-rose-500'}>{d.amount.toLocaleString()}円</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}