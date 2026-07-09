import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Play, 
  Pause, 
  RotateCcw,
  Plus, 
  Trash2, 
  Cpu, 
  Activity, 
  BarChart2, 
  Settings2, 
  TrendingUp,
  Clock,
  LayoutGrid,
  ChevronRight,
  Menu,
  X,
  FastForward,
  PlayCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ALGO_MAP = {
  'FCFS (First Come First Serve)': '1',
  'Round Robin': '2',
  'SPN (Shortest Process Next)': '3',
  'SRT (Shortest Remaining Time)': '4',
  'HRRN (Highest Response Ratio)': '5',
  'FB-1 (Feedback 1)': '6',
  'FB-2i (Feedback 2i)': '7',
  'Aging': '8'
};

const PROCESS_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-cyan-500',
  'bg-rose-500',
];

function App() {
  const [selectedAlgo, setSelectedAlgo] = useState('FCFS (First Come First Serve)');
  const [quantum, setQuantum] = useState(2);
  const [lastInstant, setLastInstant] = useState(20);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [traceData, setTraceData] = useState([]);
  const [statsData, setStatsData] = useState(null);
  
  const [activeView, setActiveView] = useState('initial'); // 'initial', 'simulation', 'benchmark'
  const [benchmarkResults, setBenchmarkResults] = useState([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(600);
  const playbackRef = useRef(null);

  const socketRef = useRef(null);

  const [processes, setProcesses] = useState([
    { id: 1, name: 'A', arrival: 0, service: 3 },
    { id: 2, name: 'B', arrival: 2, service: 6 },
    { id: 3, name: 'C', arrival: 4, service: 4 },
    { id: 4, name: 'D', arrival: 6, service: 5 },
    { id: 5, name: 'E', arrival: 8, service: 2 },
  ]);

  useEffect(() => {
    socketRef.current = io(API_URL);

    socketRef.current.on('simulation_error', (error) => {
      console.error("Core Engine Error:", error);
      alert(`Simulation failed: ${error.error}`);
      setLoading(false);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      playbackRef.current = setInterval(() => {
        setPlaybackTime(prev => {
          if (prev >= lastInstant - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      clearInterval(playbackRef.current);
    }
    return () => clearInterval(playbackRef.current);
  }, [isPlaying, playbackSpeed, lastInstant]);

  const addProcess = () => {
    if (processes.length >= 15) {
      alert("Maximum of 15 processes allowed to prevent cloud execution timeouts during benchmarking.");
      return;
    }
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const newName = letters[processes.length % 26];
    setProcesses([...processes, { id: Date.now(), name: newName, arrival: 0, service: 3 }]);
  };

  const removeProcess = (id) => {
    if (processes.length > 1) {
      setProcesses(processes.filter(p => p.id !== id));
    }
  };

  const updateProcess = (id, field, value) => {
    const numericValue = value === '' ? 0 : Math.max(0, parseInt(value, 10));
    setProcesses(processes.map(p => p.id === id ? { ...p, [field]: numericValue } : p));
  };

  const updateProcessName = (id, newName) => {
    setProcesses(processes.map(p => p.id === id ? { ...p, name: newName.toUpperCase().slice(0, 3) } : p));
  };

  const triggerSimulation = () => {
    setLoading(true);
    setIsPlaying(false);
    setPlaybackTime(0);
    setTraceData([]);
    setStatsData(null);
    
    const algoString = selectedAlgo === 'Round Robin' ? `2-${quantum}` : ALGO_MAP[selectedAlgo];
    
    const payload = {
      operation: 'trace', 
      algorithms: [algoString],
      lastInstant: parseInt(lastInstant, 10),
      processes: processes.map(p => ({
        name: p.name,
        arrival: parseInt(p.arrival, 10),
        service: parseInt(p.service, 10)
      }))
    };

    socketRef.current.off('simulation_stream_chunk');
    socketRef.current.off('simulation_finished');

    socketRef.current.emit('start_realtime_simulation', payload);

    socketRef.current.on('simulation_stream_chunk', (response) => {
      try {
        const simulationArray = JSON.parse(response.data);
        const activeAlgoData = simulationArray[0];

        const formattedGantt = Object.entries(activeAlgoData.timeline).map(([name, timelineArray]) => ({
          name,
          timeline: timelineArray.join('')
        }));

        const statsObj = activeAlgoData.statistics;
        const formattedStats = {
          pNames: statsObj.processes.map(p => p.name),
          rows: [
            { label: 'Arrival Time', key: 'arrival', values: statsObj.processes.map(p => p.arrival.toString()) },
            { label: 'Service Time', key: 'service', values: statsObj.processes.map(p => p.service.toString()) },
            { label: 'Finish Time', key: 'finish', values: statsObj.processes.map(p => p.finish.toString()) },
            { label: 'Turnaround Time', key: 'turnaround', values: statsObj.processes.map(p => p.turnaround.toString()) },
            { label: 'Normalized Turnaround', key: 'normturn', values: statsObj.processes.map(p => p.normturn.toFixed(2)) }
          ],
          means: {
            service: '',
            turnaround: statsObj.meanTurnaround.toFixed(2),
            normturn: statsObj.meanNormTurn.toFixed(2)
          }
        };

        setTraceData(formattedGantt);
        setStatsData(formattedStats);
        setActiveView('simulation');
      } catch (err) {
        console.error("Chunk parsing boundary dropped:", err.message);
      }
    });

    socketRef.current.on('simulation_finished', (msg) => {
      setLoading(false);
      setTimeout(() => {
        setIsPlaying(true);
      }, 300);
    });
  };

  const triggerBenchmarkAll = async () => {
    setLoading(true);
    setIsPlaying(false);
    
    const allAlgos = ['1', '2-2', '3', '4', '5', '6', '7', '8-1']; 
    
    const payload = {
      operation: 'stats',
      algorithms: allAlgos,
      lastInstant: parseInt(lastInstant, 10),
      processes: processes.map(p => ({
        name: p.name,
        arrival: parseInt(p.arrival, 10),
        service: parseInt(p.service, 10)
      }))
    };

    try {
      const response = await axios.post(`${API_URL}/api/simulate`, payload);
      const simulationMatrix = response.data.data; 

      const leaderboardData = simulationMatrix.map(result => ({
        algorithm: result.algorithm,
        meanTurnaround: result.statistics.meanTurnaround,
        meanNormTurn: result.statistics.meanNormTurn
      })).sort((a, b) => a.meanTurnaround - b.meanTurnaround); 

      setBenchmarkResults(leaderboardData);
      setActiveView('benchmark');
    } catch (error) {
      console.error(error);
      alert('Failed to execute comparative benchmarking simulation.');
    } finally {
      setLoading(false);
    }
  };

  const resetPlayback = () => {
    setIsPlaying(false);
    setPlaybackTime(0);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans overflow-x-hidden flex flex-col lg:flex-row relative selection:bg-white/20 selection:text-white">
      
      {/* Subtle background blurs for sophisticated glassmorphism */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/10 blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/10 blur-[120px]"></div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 glass sticky top-0 w-full z-40 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Cpu className="text-white" size={20} />
          <span className="font-semibold text-white tracking-wide">Core Scheduler</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen glass border-r border-white/5 p-6 flex flex-col gap-8 z-30 transition-transform duration-300 w-full md:w-[340px] flex-shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        
        <div className="hidden lg:flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black">
            <Cpu size={18} />
          </div>
          <span className="font-semibold text-lg text-white tracking-wide">Scheduler</span>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={triggerSimulation} 
            disabled={loading}
            className="w-full py-3 bg-white hover:bg-gray-200 disabled:opacity-50 text-black font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <Play size={16} className="fill-current" />
                <span>Simulate Engine</span>
              </>
            )}
          </button>
          
          <button
            onClick={triggerBenchmarkAll}
            disabled={loading}
            className="w-full py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-medium rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2"
          >
            <Activity size={16} />
            <span>Benchmark All</span>
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar pb-20 lg:pb-0">
          
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 font-medium flex items-center gap-2">
              <Settings2 size={14}/> Algorithm
            </label>
            <div className="relative">
              <select 
                value={selectedAlgo}
                onChange={(e) => setSelectedAlgo(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-all appearance-none cursor-pointer"
              >
                {Object.keys(ALGO_MAP).map(algo => (
                  <option key={algo} value={algo} className="bg-[#0f1115]">{algo}</option>
                ))}
              </select>
              <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500">
                <ChevronRight size={16} className="rotate-90" />
              </div>
            </div>
          </div>

          {selectedAlgo === 'Round Robin' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 font-medium">Time Quantum (q)</label>
              <input 
                type="number" 
                min="1" 
                value={quantum} 
                onChange={(e) => setQuantum(Math.max(1, parseInt(e.target.value, 10)))}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </motion.div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 font-medium flex items-center gap-2">
              <Clock size={14}/> Timeline Bounds
            </label>
            <input 
              type="number" 
              min="5" 
              max="50" 
              value={lastInstant} 
              onChange={(e) => setLastInstant(Math.min(50, Math.max(5, parseInt(e.target.value, 10))))}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-400 font-medium">Processes ({processes.length})</label>
              <button 
                onClick={addProcess} 
                className="flex items-center gap-1 text-white hover:bg-white/10 text-xs px-2.5 py-1.5 rounded-lg border border-transparent transition-all"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {processes.map((p, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, scale: 0.95 }} 
                    key={p.id} 
                    className="glass-card p-4 rounded-xl flex flex-col gap-3"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${PROCESS_COLORS[idx % PROCESS_COLORS.length]}`} />
                        <input 
                          value={p.name} 
                          onChange={(e) => updateProcessName(p.id, e.target.value)} 
                          className="bg-transparent text-white font-semibold w-12 focus:outline-none uppercase text-sm"
                          placeholder="Name"
                          maxLength={3}
                        />
                      </div>
                      <button 
                        onClick={() => removeProcess(p.id)} 
                        className="text-gray-500 hover:text-white transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-medium mb-1 uppercase tracking-wide">Arrival</span>
                        <input 
                          type="number" 
                          min="0" 
                          value={p.arrival} 
                          onChange={(e) => updateProcess(p.id, 'arrival', e.target.value)} 
                          className="w-full bg-black/40 border border-white/5 rounded-lg p-2 text-white text-xs text-center focus:outline-none focus:border-white/30" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-medium mb-1 uppercase tracking-wide">Service</span>
                        <input 
                          type="number" 
                          min="1" 
                          value={p.service} 
                          onChange={(e) => updateProcess(p.id, 'service', e.target.value)} 
                          className="w-full bg-black/40 border border-white/5 rounded-lg p-2 text-white text-xs text-center focus:outline-none focus:border-white/30" 
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-4 md:p-8 lg:p-12 w-full max-w-6xl mx-auto min-h-[90vh] relative z-10">
        {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 border-2 border-white/20 border-t-white rounded-full animate-spin mb-6" />
            <h2 className="text-xl font-medium text-white mb-2">Simulating Execution</h2>
            <p className="text-gray-400 text-sm">Streaming data from C++ Engine...</p>
          </div>
        ) : activeView === 'initial' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-16 h-16 glass-card rounded-2xl flex items-center justify-center border border-white/10 mb-6 shadow-xl">
              <Cpu className="text-white/80" size={32} />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">CPU Simulator</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Configure parameters and processes in the sidebar. Run the engine to view Gantt charts and algorithm analytics.
            </p>
          </div>
        ) : activeView === 'simulation' ? (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 w-full pb-20">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-card p-6 rounded-3xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Algorithm</p>
                  <h3 className="text-lg font-semibold text-white">{selectedAlgo.split(' ')[0]}</h3>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white">
                  <LayoutGrid size={18} />
                </div>
              </div>
              <div className="glass-card p-6 rounded-3xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Mean Turnaround</p>
                  <h3 className="text-xl font-semibold text-white">
                    {statsData?.means['turnaround'] ? `${statsData.means['turnaround']} ms` : 'N/A'}
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white">
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="glass-card p-6 rounded-3xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Mean Normalized</p>
                  <h3 className="text-xl font-semibold text-white">
                    {statsData?.means['normturn'] ? `${statsData.means['normturn']}` : 'N/A'}
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white">
                  <BarChart2 size={18} />
                </div>
              </div>
            </div>

            <div className="glass-card p-6 md:p-8 rounded-3xl flex flex-col gap-6 w-full">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Live Timeline</h3>
                  <p className="text-xs text-gray-400 mt-1">Interactive Gantt Visualization</p>
                </div>
                <div className="flex items-center gap-2 bg-black/30 px-2 py-1.5 rounded-xl border border-white/5">
                  <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors">
                    {isPlaying ? <Pause size={14} /> : <Play size={14} className="fill-current" />}
                  </button>
                  <button onClick={resetPlayback} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                    <RotateCcw size={14} />
                  </button>
                  <div className="w-px h-4 bg-white/10 mx-1" />
                  <span className="text-xs font-mono text-gray-400 px-2">
                    {playbackTime} / {lastInstant}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto w-full">
                <div className="flex flex-col gap-3 min-w-[600px] pb-4">
                  {traceData.map((pTrace, pIdx) => (
                    <div key={pIdx} className="flex items-center gap-4">
                      <div className="w-12 text-sm font-medium text-gray-300 flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${PROCESS_COLORS[pIdx % PROCESS_COLORS.length]}`} />
                        P_{pTrace.name}
                      </div>

                      <div className="flex gap-[2px] flex-1">
                        {pTrace.timeline.split('').map((char, timeIdx) => {
                          const isPastStep = timeIdx <= playbackTime;
                          const isActive = char === '*' && isPastStep;
                          const isWaiting = char === '.' && isPastStep;

                          return (
                            <div 
                              key={timeIdx}
                              className={`h-8 flex-1 rounded-md text-[10px] font-bold flex items-center justify-center transition-all duration-300
                                ${isActive ? `${PROCESS_COLORS[pIdx % PROCESS_COLORS.length]} text-white shadow-sm` : 
                                  isWaiting ? 'bg-white/10 text-white/50 border border-white/5' : 
                                  'bg-black/20 text-transparent border border-transparent'}`
                              }
                            >
                              {isActive ? pTrace.name : isWaiting ? '•' : ''}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center gap-4 mt-1">
                    <div className="w-12" />
                    <div className="flex flex-1 justify-between px-1 text-gray-500 font-mono text-[10px]">
                      {Array.from({ length: Math.min(lastInstant, 50) }).map((_, i) => (
                        <div key={i} className="flex-1 text-center">{i}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-2">
                <span className="text-xs text-gray-500 font-medium">Speed</span>
                <div className="flex gap-2 bg-black/20 p-1 rounded-xl border border-white/5">
                  {[1200, 600, 250].map((speed, speedIdx) => (
                    <button 
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        playbackSpeed === speed 
                          ? 'bg-white/10 text-white' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {['Slow', 'Normal', 'Fast'][speedIdx]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {statsData && (
              <div className="glass-card p-6 md:p-8 rounded-3xl flex flex-col gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">Statistical Analytics</h3>
                  <p className="text-xs text-gray-400 mt-1">Mathematical parameters from C++</p>
                </div>
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider font-medium">
                        <th className="pb-4 font-medium">Metric</th>
                        {statsData.pNames.map((name, pIdx) => (
                          <th key={pIdx} className="pb-4 text-center font-medium">
                            P_{name}
                          </th>
                        ))}
                        <th className="pb-4 text-center font-medium text-white">Mean</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-white/5">
                      {statsData.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                          <td className="py-4 text-gray-300 font-medium">{row.label}</td>
                          {row.values.map((val, vIdx) => (
                            <td key={vIdx} className="py-4 text-gray-400 text-center font-mono">{val}</td>
                          ))}
                          <td className="py-4 text-white text-center font-mono font-medium">
                            {statsData.means[row.key] ? statsData.means[row.key] : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : activeView === 'benchmark' ? (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 w-full pb-20">
            {benchmarkResults.length > 0 && (
              <div className="glass-card p-6 md:p-8 rounded-3xl w-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">Benchmark Leaderboard</h3>
                    <p className="text-sm text-gray-400 mt-1">Algorithm efficiency ranking</p>
                  </div>
                  <button 
                    onClick={() => setActiveView(traceData.length > 0 ? 'simulation' : 'initial')}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-white transition-all flex items-center gap-2"
                  >
                    Back to Setup
                  </button>
                </div>
                <div className="space-y-3">
                  {benchmarkResults.map((result, index) => (
                    <div 
                      key={result.algorithm} 
                      className={`flex flex-col md:flex-row md:items-center justify-between p-5 rounded-2xl border transition-all ${
                        index === 0 
                          ? 'bg-white/10 border-white/20' 
                          : 'bg-black/20 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center space-x-4 mb-4 md:mb-0">
                        <span className="text-sm font-mono text-gray-500">#{index + 1}</span>
                        <span className={`font-semibold text-lg ${index === 0 ? 'text-white' : 'text-gray-300'}`}>
                          {result.algorithm}
                        </span>
                        {index === 0 && (
                          <span className="text-[10px] px-2.5 py-1 bg-white/20 text-white rounded-lg font-medium">
                            FASTEST
                          </span>
                        )}
                      </div>
                      <div className="flex space-x-8 font-mono text-sm">
                        <div className="flex flex-col gap-1">
                          <span className="text-gray-500 text-[10px] uppercase tracking-wider font-sans font-medium">Turnaround</span>
                          <span className={`font-medium ${index === 0 ? 'text-white' : 'text-gray-300'}`}>
                            {result.meanTurnaround.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-gray-500 text-[10px] uppercase tracking-wider font-sans font-medium">Norm Turn</span>
                          <span className={`font-medium ${index === 0 ? 'text-white' : 'text-gray-300'}`}>
                            {result.meanNormTurn.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
