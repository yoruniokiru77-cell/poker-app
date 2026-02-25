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
  // デフォルト値を 30000 に設定
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
        setAllChipCounts(parsed.allChipCounts || {});
        // 保存データがある場合はそれを、ない場合は 30000 を使用
        setInitialStack(parsed.initialStack !== undefined ? parsed.initialStack : 30000);
      } catch (e) { console.error("復元失敗", e); }
    }
    fetchData();
  }, []);

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
      setEvents(Object.values(grouped).map((ev: any) => ({
        ...ev,
        data: ev.data.sort((a: any, b: any) => b.amount - a.amount)
      })));
    }
    setLoading(false);
  };

  const toggleCheck = (id: string) => {
    setCheckedEventIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const getFinalPoints = (name: string) => {
    const val = points[name] || 0;
    const mode = inputModes[name] || 'pt';
    return mode === 'pt' ? val : val * 2;
  };

  const totalDifferencePt = useMemo(() => {
    return selectedIds.reduce((sum, name) => sum + getFinalPoints(name), 0);
  }, [selectedIds, points, inputModes]);

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
    if (loans.length === 0) return;
    const newPoints = { ...points };
    const newInputModes = { ...inputModes };
    loans.forEach(loan => {
      if (loan.from !== '在庫') {
        newPoints[loan.from] = getFinalPoints(loan.from) + loan.amount;
        newInputModes[loan.from] = 'pt';
      }
      if (loan.to !== '在庫') {
        newPoints[loan.to] = getFinalPoints(loan.to) - loan.amount;
        newInputModes[loan.to] = 'pt';
      }
    });
    setPoints(newPoints);
    setInputModes(newInputModes);
    setIsLoanApplied(true);
  };

  const saveEvent = async () => {
    if (totalDifferencePt !== 0) return alert(`合計を0ptにしてください`);
    const eventId = crypto.randomUUID();
    const insertData = selectedIds.map(name => {
        const val = points[name] || 0;
        const mode = inputModes[name] || 'pt';
        return { event_id: eventId, player_name: name, amount: mode === 'pt' ? val / 2 : val, status: "清算済み" };
    });
    const { error } = await supabase.from('sessions').insert(insertData);
    if (error) alert("保存失敗");
    else { 
      alert("保存成功！"); 
      fetchData(); 
      setSelectedIds([]); setPoints({}); setLoans([]); setIsLoanApplied(false); setAllChipCounts({});
      setInitialStack(30000); // 保存後にデフォルト値へ
      localStorage.removeItem('poker_draft');
    }
  };

  const toggleEditMode = () => {
    if (!isEditMode) {
      const pw = prompt("パスワード入力");
      if (pw === "poker999") setIsEditMode(true);
    } else setIsEditMode(false);
  };

  if (loading) return <div className="p-10 text-center text-slate-400 font-bold">読み込み中...</div>;

  return (
    <div className="max-w-md mx-auto p-4 bg-slate-50 min-h-screen text-slate-900">
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-emerald-500 font-bold tracking-widest">● ONLINE</div>
        <button onClick={toggleEditMode} className={`text-[10px] px-3 py-1 rounded-full border ${isEditMode ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>
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
          {/* 貸借メモセクション */}
          <div className={`p-4 rounded-2xl mb-6 border transition-all ${isLoanApplied && !isEditMode ? 'bg-slate-100 border-slate-200' : 'bg-amber-50 border-amber-100 shadow-sm'}`}>
            <div className="flex justify-between items-center mb-3">
              <h2 className={`text-[10px] font-black uppercase flex items-center gap-1 ${isLoanApplied && !isEditMode ? 'text-slate-400' : 'text-amber-600'}`}>
                {isLoanApplied && !isEditMode ? '🔒 貸借反映済み' : '🤝 貸借メモ'}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select disabled={isLoanApplied && !isEditMode} value={loanFrom} onChange={(e)=>setLoanFrom(e.target.value)} className="p-2 text-xs rounded-lg border-none bg-white outline-none">
                <option value="">貸した人</option><option value="在庫">📦 在庫</option>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select disabled={isLoanApplied && !isEditMode} value={loanTo} onChange={(e)=>setLoanTo(e.target.value)} className="p-2 text-xs rounded-lg border-none bg-white outline-none">
                <option value="">借りた人</option><option value="在庫">📦 在庫</option>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-3">
              <input disabled={isLoanApplied && !isEditMode} type="number" placeholder="ptを入力" value={loanAmount || ""} onChange={(e)=>setLoanAmount(parseInt(e.target.value)||0)} className="flex-1 p-2 text-xs rounded-lg border-none outline-none font-bold" />
              <button disabled={isLoanApplied && !isEditMode} onClick={addLoan} className="bg-amber-500 text-white px-4 rounded-lg text-xs font-bold active:scale-95">追加</button>
            </div>
            {loans.length > 0 && (
              <div className="space-y-1">
                {loans.map((l, i) => (
                  <div key={i} className={`text-[10px] font-bold flex justify-between p-1.5 px-3 rounded ${isLoanApplied && !isEditMode ? 'text-slate-400 bg-slate-50' : 'text-amber-700 bg-white/60'}`}>
                    <span>{l.from} → {l.to}</span><span>{l.amount.toLocaleString()} pt</span>
                  </div>
                ))}
                {!isLoanApplied || isEditMode ? (
                  <button onClick={applyLoansToScore} className="w-full mt-2 bg-indigo-600 text-white py-2 rounded-lg text-[10px] font-black shadow-md">収支(pt)に反映してロック</button>
                ) : (
                  <div className="text-center py-2 text-[9px] text-slate-400 font-bold italic tracking-wider">反映済み</div>
                )}
              </div>
            )}
          </div>

          {/* 新規セクション */}
          <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 border border-slate-100 text-slate-900">
            <h2 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest flex justify-between">
              新規セッション
              {selectedIds.length > 0 && <button onClick={() => { if(confirm("リセット？")) { setSelectedIds([]); setPoints({}); setLoans([]); setIsLoanApplied(false); setAllChipCounts({}); setInitialStack(30000); localStorage.removeItem('poker_draft'); }}} className="text-[8px] text-rose-400 border border-rose-100 px-2 rounded-md">クリア</button>}
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
                  {(inputModes[name] || 'pt') === 'pt' && <button onClick={() => setCalcTarget(name)} className="p-2 bg-slate-100 rounded-lg text-slate-400">⌨</button>}
                  <input type="number" placeholder="0" value={points[name] || ""} onChange={(e) => setPoints({ ...points, [name]: parseInt(e.target.value) || 0 })} className="flex-1 p-2 border-2 border-slate-100 rounded-lg text-right outline-none font-mono font-bold" />
                  <span className="text-xs font-bold text-slate-400 w-8">{(inputModes[name] || 'pt') === 'pt' ? 'pt' : '円'}</span>
                </div>
              </div>
            ))}
            <button onClick={saveEvent} disabled={selectedIds.length === 0} className={`w-full py-4 rounded-xl font-black mt-4 transition-all active:scale-95 shadow-lg ${totalDifferencePt === 0 && selectedIds.length > 0 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-400'}`}>
              {selectedIds.length === 0 ? 'プレイヤー未選択' : totalDifferencePt === 0 ? 'DBに保存（清算）' : `あと ${totalDifferencePt > 0 ? '-' : '+'}${Math.abs(totalDifferencePt).toLocaleString()} pt`}
            </button>
          </div>

          {/* 履歴セクション */}
          <div className="space-y-4 pb-24 mt-8">
            <h2 className="text-xs font-black text-slate-400 uppercase px-1">履歴 (合算確認)</h2>
            {events.map(ev => (
              <div key={ev.id} onClick={() => toggleCheck(ev.id)} className={`bg-white p-4 rounded-2xl shadow-sm border transition-all ${checkedEventIds.includes(ev.id) ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-100'}`}>
                <div className="flex items-center justify-between mb-3 text-[10px] font-bold text-slate-400">
                   <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border ${checkedEventIds.includes(ev.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white'}`}></div>
                    {ev.date}
                  </div>
                </div>
                {ev.data.map((d: any) => (
                  <div key={d.name} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0 font-bold">
                    <span className="text-slate-600">{d.name}</span>
                    <span className={d.amount >= 0 ? 'text-indigo-600' : 'text-rose-500'}>{d.amount.toLocaleString()}円</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {checkedEventIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xs px-4">
              <button onClick={() => {
                const selected = events.filter(e => checkedEventIds.includes(e.id));
                const combined: Record<string, number> = {};
                selected.forEach(ev => ev.data.forEach((p: any) => combined[p.name] = (combined[p.name] || 0) + p.amount));
                setSumPopup({ show: true, results: Object.entries(combined).map(([name, total]) => ({ name, total })).sort((a,b)=>b.total-a.total), details: `${checkedEventIds.length}件の合算` });
              }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-2xl border-4 border-white">合算を表示</button>
            </div>
          )}
        </>
      )}

      {/* チップ計算モーダル */}
      {calcTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-800">{calcTarget} さんの計算</h3>
              <button onClick={() => setCalcTarget(null)} className="text-slate-400 text-2xl">&times;</button>
            </div>
            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">初期スタック (30,000pt デフォルト)</span>
                <span className="text-xs font-mono font-bold text-slate-600">{initialStack.toLocaleString()} pt</span>
              </div>
              <input type="range" min="0" max="100000" step="1000" value={initialStack} onChange={(e) => setInitialStack(parseInt(e.target.value))} className="w-full accent-indigo-600" />
            </div>
            <div className="space-y-3 mb-6">
              {['50', '100', '500', '1000', '5000'].map(val => {
                const currentCounts = allChipCounts[calcTarget!] || { "50": 0, "100": 0, "500": 0, "1000": 0, "5000": 0 };
                return (
                  <div key={val} className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100 shadow-sm text-slate-900">
                    <div className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center text-[10px] font-black text-indigo-500">{val}</div>
                    <input type="number" value={currentCounts[val] || ""} placeholder="0" onChange={(e) => updateChipCount(val, parseInt(e.target.value) || 0)} className="w-20 p-2 bg-slate-50 border-transparent rounded-lg text-right font-mono font-bold outline-none" />
                  </div>
                );
              })}
            </div>
            <button onClick={applyChipCalc} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg">収支を反映</button>
          </div>
        </div>
      )}

      {/* 通算ポップアップ */}
      {sumPopup?.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6" onClick={() => setSumPopup(null)}>
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
               <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">通算収支</div>
            </div>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-8 pr-2">
              {sumPopup.results.map(res => (
                <div key={res.name} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                  <span className="font-bold text-slate-700">{res.name}</span>
                  <span className={`font-mono font-black ${res.total >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{res.total.toLocaleString()}円</span>
                </div>
              ))}
            </div>
            <button onClick={() => { setSumPopup(null); setCheckedEventIds([]); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs shadow-lg">閉じて選択解除</button>
          </div>
        </div>
      )}

      {/* ランキング、名簿タブは既存のまま */}
    </div>
  );
}