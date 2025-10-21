import React, { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import GameInterface from './GameInterface';
import { encryptMove, isFheAvailable } from '../utils/fhe';

const TABS = {
  CREATE: 'create',
  JOIN: 'join',
  MINE: 'mine',
  COMPLETED: 'completed',
};

const ChoiceSelector = ({ value, onChange }) => {
  const choices = [
    { value: 0, label: 'Rock', emoji: '🗿', isImage: true, imageUrl: '/images/granite-Photoroom.png' },
    { value: 1, label: 'Paper', emoji: '📄' },
    { value: 2, label: 'Scissors', emoji: '✂️' },
  ];
  return (
    <div className="flex items-center justify-center space-x-2">
      {choices.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`w-14 h-14 rounded-lg flex items-center justify-center text-xl transition-all duration-200 ${
            value === c.value 
              ? 'bg-teal-600 text-white ring-2 ring-teal-500 ring-opacity-50' 
              : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 border border-slate-600/40'
          }`}
        >
          {c.isImage ? (
            <img 
              src={c.imageUrl} 
              alt={c.label}
              style={{ width: '2rem', height: '2rem' }}
            />
          ) : (
            c.emoji
          )}
        </button>
      ))}
    </div>
  );
};

const MyGamesList = ({ contract, account }) => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadMyGames = useCallback(async () => {
    if (!contract || !account) return;
    try {
      setLoading(true);
      // Force clear games state before loading
      setGames([]);
      
      // Force latest block to avoid cache issues
      const counter = await contract.gameIdCounter({ blockTag: 'latest' });
      const allIds = Array.from({ length: Number(counter) }, (_, i) => BigInt(i + 1));

      // Read mapping and filter games where user is player1 or player2
      // Force latest block for each read
      const details = await Promise.all(
        allIds.map(async (id) => {
          const g = await contract.games(id, { blockTag: 'latest' });
          const isMyGame = g.player1?.toLowerCase() === account?.toLowerCase() || g.player2?.toLowerCase() === account?.toLowerCase();
          return isMyGame ? { id, g } : null;
        })
      );
      const myGames = details.filter(Boolean);

      // Sort by most recent
      myGames.sort((a, b) => Number(b.id - a.id));

      // Format games with status
      const formattedGames = myGames.map(({ id, g }) => {
        const isPlayer1 = g.player1?.toLowerCase() === account?.toLowerCase();
        const isPlayer2 = g.player2?.toLowerCase() === account?.toLowerCase();
        const hasBothPlayers = g.player1 && g.player1 !== ethers.ZeroAddress && g.player2 && g.player2 !== ethers.ZeroAddress;
        const isExpired = g.isExpired;
        const isDecryptRequested = Boolean(g.decryptionRequested);
        const isDecryptCompleted = Boolean(g.decryptionCompleted);
        // Treat result as valid only AFTER decryptionCompleted to avoid default 0 value
        const resultCode = isDecryptCompleted && (g.resultCode !== null && g.resultCode !== undefined)
          ? Number(g.resultCode)
          : null;
        const winner = g.winner;
        
        
        // Check if game is within 24 hours deadline
        const now = Math.floor(Date.now() / 1000);
        const gameStartTime = g.startTime ? Number(g.startTime) : 0;
        const isWithinDeadline = (now - gameStartTime) < 86400; // 24 hours
        
        let status = 'WAITING';
        if (isExpired) {
          status = 'EXPIRED';
        } else if (!isWithinDeadline) {
          status = 'EXPIRED'; // Timeout after 24 hours
        } else if (hasBothPlayers) {
          if (isDecryptRequested && !isDecryptCompleted) {
            status = 'PENDING_DECRYPTION'; // Waiting for oracle result
          } else if (isDecryptCompleted) {
            status = 'COMPLETED';
          } else {
            status = 'ACTIVE';
          }
        }

        return {
          id,
          player1: g.player1,
          player2: g.player2,
          bet: ethers.formatEther(g.betAmount ?? 0n),
          startTime: g.startTime ? new Date(Number(g.startTime) * 1000) : null,
          status,
          isPlayer1,
          isPlayer2,
          result: resultCode,
          winner: winner
        };
      });

      setGames(formattedGames);
    } catch (e) {
      console.error('Failed to load my games', e);
    } finally {
      setLoading(false);
    }
  }, [contract, account]);

  useEffect(() => {
    loadMyGames();
    const intervalId = setInterval(() => {
      loadMyGames();
    }, 30000); // auto-refresh every 30s (backup only, events should handle most updates)
    return () => clearInterval(intervalId);
  }, [loadMyGames]);

  // Listen for DecryptionCompleted events
  useEffect(() => {
    if (!contract) return;
    
    const onDecryptionCompleted = (gameId, requestId, resultCode, winner, event) => {
      // Immediately refresh games when decryption completes
      loadMyGames();
    };
    
    contract.on('DecryptionCompleted', onDecryptionCompleted);
    
    return () => {
      try { contract.off('DecryptionCompleted', onDecryptionCompleted); } catch (_) {}
    };
  }, [contract, loadMyGames]);

  // Also listen for new blocks as backup
  useEffect(() => {
    const provider = contract?.runner?.provider;
    if (!provider) return;
    
    const onBlock = () => {
      loadMyGames();
    };
    
    provider.on('block', onBlock);
    
    return () => {
      try { provider.off('block', onBlock); } catch (_) {}
    };
  }, [contract, loadMyGames]);

  const getStatusBadge = (status, result, isPlayer1, winner, account) => {
    if (status === 'EXPIRED') {
      return <span className="badge bg-orange-900/30 text-orange-300">Time Expired</span>;
    }
    if (status === 'WAITING') {
      return <span className="badge badge-accent">Waiting for Player</span>;
    }
    if (status === 'ACTIVE') {
      return <span className="badge badge-accent">In Progress</span>;
    }
    if (status === 'PENDING_DECRYPTION') {
      return <span className="badge bg-blue-900/30 text-blue-300">Waiting for Result</span>;
    }
    if (status === 'COMPLETED') {
      if (result === 2) {
        return <span className="badge bg-yellow-900/30 text-yellow-300">Draw</span>;
      }
      if (winner?.toLowerCase() === account?.toLowerCase()) {
        return <span className="badge bg-green-900/30 text-green-300">Won</span>;
      } else {
        return <span className="badge bg-red-900/30 text-red-300">Lost</span>;
      }
    }
    return <span className="badge badge-muted">Unknown</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <h3 className="text-2xl font-bold text-white mb-1">My Games</h3>
          <p className="text-slate-400">Track your active and completed games</p>
        </div>
        <button className="refresh-btn" onClick={loadMyGames} disabled={loading} aria-label="Refresh My Games">
          <svg className={`refresh-icon ${loading ? 'spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7"/>
            <polyline points="21 3 21 9 15 9"/>
          </svg>
        </button>
      </div>

      {/* Games List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-slate-400">Loading your games...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎮</div>
            <h4 className="text-xl font-semibold text-white mb-2">No Games Yet</h4>
            <p className="text-slate-400">Create or join a game to get started!</p>
          </div>
        ) : (
          games.map((game) => (
            <div key={game.id.toString()} className="game-card p-6">
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 items-center">
                {/* Game Info */}
                <div className="lg:col-span-2">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-teal-600/20 flex items-center justify-center">
                      <span className="text-2xl">🎯</span>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">Game #{game.id.toString()}</h4>
                      <p className="text-sm text-slate-400">
                        {game.isPlayer1 ? 'You are Player 1' : 'You are Player 2'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Opponent */}
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-1">Opponent</div>
                  <div className="text-sm text-white font-medium">
                    {game.isPlayer1 
                      ? (game.player2 ? `${game.player2.slice(0,6)}...${game.player2.slice(-4)}` : 'Waiting...')
                      : (game.player1 ? `${game.player1.slice(0,6)}...${game.player1.slice(-4)}` : 'Unknown')
                    }
                  </div>
                </div>

                {/* Bet Amount */}
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-1">Bet Amount</div>
                  <div className="text-lg font-bold text-teal-400">
                    {game.bet} ETH
                  </div>
                </div>

                {/* Status */}
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-2">Status</div>
                  {getStatusBadge(game.status, game.result, game.isPlayer1, game.winner, account)}
                </div>

                {/* Time */}
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-1">Created</div>
                  <div className="text-sm text-white font-medium">
                    {game.startTime ? game.startTime.toLocaleString() : '-'}
                  </div>
                </div>

                {/* Actions */}
                <div className="text-center">
                  {game.status === 'WAITING' && (
                    <span className="text-sm text-slate-400">Waiting for opponent...</span>
                  )}
                  {game.status === 'ACTIVE' && (
                    <span className="text-sm text-slate-400">Game in progress...</span>
                  )}
                  {game.status === 'PENDING_DECRYPTION' && (
                    <span className="text-sm text-blue-400">Waiting for oracle result...</span>
                  )}
                  {game.status === 'EXPIRED' && (
                    <span className="text-sm text-orange-400">Time expired (24h)</span>
                  )}
                  {game.status === 'COMPLETED' && (
                    <div className="text-sm">
                      {game.result === 2 ? (
                        <div>
                          <div className="text-yellow-400 font-medium">Draw</div>
                          <div className="text-xs text-slate-500">No winner</div>
                        </div>
                      ) : (
                        <div>
                          <div className={game.winner?.toLowerCase() === account?.toLowerCase() ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                            {game.winner?.toLowerCase() === account?.toLowerCase() ? 'You Won!' : 'You Lost'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {game.winner?.toLowerCase() === account?.toLowerCase() ? `+${game.bet} ETH` : `-${game.bet} ETH`}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const CompletedGamesList = ({ contract, account }) => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const loadCompletedGames = async () => {
    if (!contract) return;
    try {
      setLoading(true);
      const counter = await contract.gameIdCounter();
      const allIds = Array.from({ length: Number(counter) }, (_, i) => BigInt(i + 1));

      // Read mapping and filter past games: completed or pending decryption
      const details = await Promise.all(
        allIds.map(async (id) => {
          const g = await contract.games(id);
          const hasResult = g.resultCode !== null && g.resultCode !== undefined;
          const pendingDecryption = g.decryptionRequested && !g.decryptionCompleted;
          return (hasResult || pendingDecryption) ? { id, g } : null;
        })
      );
      const completedGames = details.filter(Boolean);

      // Sort by most recent
      completedGames.sort((a, b) => Number(b.id - a.id));

      // Pagination
      const start = (page - 1) * pageSize;
      const pageGames = completedGames.slice(start, start + pageSize).map(({ id, g }) => {
        const isPlayer1 = g.player1?.toLowerCase() === account?.toLowerCase();
        const isPlayer2 = g.player2?.toLowerCase() === account?.toLowerCase();
        const isMyGame = isPlayer1 || isPlayer2;
        const isDecryptRequested = Boolean(g.decryptionRequested);
        const isDecryptCompleted = Boolean(g.decryptionCompleted);
        const hasResult = g.resultCode !== null && g.resultCode !== undefined;
        const resultCode = (isDecryptCompleted && hasResult) ? Number(g.resultCode) : null;
        const winner = g.winner;

        let status = 'WAITING';
        if (isDecryptRequested && !isDecryptCompleted) {
          status = 'PENDING_DECRYPTION';
        } else if (isDecryptCompleted && hasResult) {
          status = 'COMPLETED';
        }

        return {
          id,
          player1: g.player1,
          player2: g.player2,
          bet: ethers.formatEther(g.betAmount ?? 0n),
          startTime: g.startTime ? new Date(Number(g.startTime) * 1000) : null,
          result: resultCode,
          winner: winner,
          isPlayer1,
          isPlayer2,
          isMyGame,
          status
        };
      });

      setGames(pageGames);
    } catch (e) {
      console.error('Failed to load completed games', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompletedGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, account, page]);

  const getResultInfo = (status, result, winner, isMyGame, account, betAmount) => {
    if (status === 'PENDING_DECRYPTION') {
      return {
        text: 'Waiting for Result',
        color: 'text-blue-300',
        bgColor: 'bg-blue-900/30',
        description: 'Oracle decryption pending'
      };
    }
    if (result === 2) {
      return {
        text: 'Draw',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-900/30',
        description: 'Refunded'
      };
    }
    
    if (isMyGame) {
      if (winner?.toLowerCase() === account?.toLowerCase()) {
        return {
          text: 'You Won',
          color: 'text-green-400',
          bgColor: 'bg-green-900/30',
          description: 'Congratulations!'
        };
      } else {
        return {
          text: 'You Lost',
          color: 'text-red-400',
          bgColor: 'bg-red-900/30',
          description: 'Better luck next time'
        };
      }
    } else {
      // Calculate winnings (2x bet amount minus fees)
      const totalPot = parseFloat(betAmount) * 2;
      const feeAmount = totalPot * 0.025; // 2.5% platform fee
      const winnings = totalPot - feeAmount;
      
      if (winner?.toLowerCase() === account?.toLowerCase()) {
        return {
          text: 'Player 1 Won',
          color: 'text-green-400',
          bgColor: 'bg-green-900/30',
          description: `+${winnings.toFixed(4)} ETH`
        };
      } else {
        return {
          text: 'Player 2 Won',
          color: 'text-green-400',
          bgColor: 'bg-green-900/30',
          description: `+${winnings.toFixed(4)} ETH`
        };
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <h3 className="text-2xl font-bold text-white mb-1">Game History</h3>
          <p className="text-slate-400">All completed games on the platform</p>
        </div>
        <button className="refresh-btn ml-4" onClick={() => { setPage(1); loadCompletedGames(); }} disabled={loading} aria-label="Refresh Completed Games">
          <svg className={`refresh-icon ${loading ? 'spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7"/>
            <polyline points="21 3 21 9 15 9"/>
          </svg>
        </button>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-400">Page {page}</span>
          <span className="text-sm text-slate-500">•</span>
          <span className="text-sm text-slate-400">{games.length} games</span>
        </div>
        <div className="flex space-x-2">
          <button 
            className="button" 
            disabled={page===1 || loading} 
            onClick={() => setPage((p)=>Math.max(1,p-1))}
          >
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>Prev</span></span>
          </button>
          <button 
            className="button" 
            disabled={games.length < pageSize || loading} 
            onClick={() => setPage((p)=>p+1)}
          >
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>Next</span></span>
          </button>
        </div>
      </div>

      {/* Games List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-slate-400">Loading game history...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h4 className="text-xl font-semibold text-white mb-2">No Completed Games</h4>
            <p className="text-slate-400">No games have been completed yet.</p>
          </div>
        ) : (
          games.map((game) => {
            const resultInfo = getResultInfo(game.status, game.result, game.winner, game.isMyGame, account, game.bet);
            return (
              <div key={game.id.toString()} className="game-card p-6">
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 items-center">
                  {/* Game Info */}
                  <div className="lg:col-span-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-600/20 flex items-center justify-center">
                        <span className="text-2xl">🏆</span>
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white">Game #{game.id.toString()}</h4>
                        <p className="text-sm text-slate-400">
                          {game.isMyGame ? 'Your Game' : 'Other Game'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Players */}
                  <div className="text-center">
                    <div className="text-sm text-slate-400 mb-1">Players</div>
                    <div className="text-sm text-white font-medium">
                      <div>{game.player1 ? `${game.player1.slice(0,6)}...${game.player1.slice(-4)}` : 'Unknown'}</div>
                      <div className="text-slate-500">vs</div>
                      <div>{game.player2 ? `${game.player2.slice(0,6)}...${game.player2.slice(-4)}` : 'Unknown'}</div>
                    </div>
                  </div>

                  {/* Bet Amount */}
                  <div className="text-center">
                    <div className="text-sm text-slate-400 mb-1">Bet Amount</div>
                    <div className="text-lg font-bold text-teal-400">
                      {game.bet} ETH
                    </div>
                  </div>

                  {/* Result */}
                  <div className="text-center">
                    <div className="text-sm text-slate-400 mb-2">Result</div>
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${resultInfo.bgColor} ${resultInfo.color}`}>
                      {resultInfo.text}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {resultInfo.description}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-center">
                    <div className="text-sm text-slate-400 mb-1">Completed</div>
                    <div className="text-sm text-white font-medium">
                      {game.startTime ? game.startTime.toLocaleString() : '-'}
                    </div>
                  </div>

                  {/* Prize Info */}
                  <div className="text-center">
                    {game.isMyGame && (
                      <div className="text-sm">
                        {game.result === 2 ? (
                          <div>
                            <div className="text-slate-400">Refunded</div>
                            <div className="text-xs text-slate-500">{game.bet} ETH</div>
                          </div>
                        ) : (
                          <div>
                            <div className={game.winner?.toLowerCase() === account?.toLowerCase() ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                              {game.winner?.toLowerCase() === account?.toLowerCase() ? 'Won' : 'Lost'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {game.winner?.toLowerCase() === account?.toLowerCase() ? `+${game.bet} ETH` : `-${game.bet} ETH`}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const ActiveGamesList = ({ contract, account, onJoined, fheInitialized, fheError }) => {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMoves, setSelectedMoves] = useState({}); // gameId -> move
  const [showEncryptModal, setShowEncryptModal] = useState(false);


  const loadPage = async () => {
    if (!contract) return;
    try {
      setLoading(true);
      const counter = await contract.gameIdCounter();
      const allIds = Array.from({ length: Number(counter) }, (_, i) => BigInt(i + 1));

      // Read mapping and filter Active (has player1, no player2, not expired, before deadline)
      const details = await Promise.all(
        allIds.map(async (id) => {
          const g = await contract.games(id);
          const isWaiting = g.player1 && g.player1 !== ethers.ZeroAddress && (!g.player2 || g.player2 === ethers.ZeroAddress);
          const isAlive = !g.isExpired;
          
          // Check if game is within 24 hours deadline
          const now = Math.floor(Date.now() / 1000);
          const gameStartTime = g.startTime ? Number(g.startTime) : 0;
          const isWithinDeadline = (now - gameStartTime) < 86400; // 24 hours
          
          return isWaiting && isAlive && isWithinDeadline ? { id, g } : null;
        })
      );
      const active = details.filter(Boolean);

      // Sort by most recent
      active.sort((a, b) => Number(b.id - a.id));

      // Pagination
      const start = (page - 1) * pageSize;
      const pageRows = active.slice(start, start + pageSize).map(({ id, g }) => ({
        id,
        opponent: g.player1,
        time: g.startTime ? new Date(Number(g.startTime) * 1000) : null,
        bet: ethers.formatEther(g.betAmount ?? 0n),
      }));

      setRows(pageRows);
    } catch (e) {
      console.error('Failed to load active games page', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, page]);

  const joinGame = async (row) => {
    if (!fheInitialized) {
      alert('FHE not initialized. Please go to Create Game tab first to initialize FHE encryption.');
      return;
    }

    if (selectedMoves[row.id?.toString()] === undefined) {
      alert('Please select a move first.');
      return;
    }

    try {
      setShowEncryptModal(true);
      const move = selectedMoves[row.id?.toString()];
      const contractAddress = await contract.getAddress();
      
      // Check if FHE is available and initialized
      if (!isFheAvailable()) {
        throw new Error('FHE not available');
      }
      
      const enc = await encryptMove(move, contractAddress, account);
      
      const tx = await contract.joinGame(row.id, enc.handle, enc.proof, { value: ethers.parseEther(row.bet) });
      await tx.wait();
      
      onJoined && onJoined();
      loadPage();
    } catch (e) {
      console.error('Join failed', e);
      alert(`Join failed: ${e.message}`);
    } finally {
      setShowEncryptModal(false);
    }
  };

  return (
    <div className="space-y-6">
      {showEncryptModal && (
        <div className="encrypt-overlay">
          <div className="encrypt-card animate-slideUp">
            <div className="encrypt-title">Encrypting your choice</div>
            <div className="encrypt-subtitle">Please wait while we securely encrypt via FHE relayer</div>
            <div className="icon-row">
              <span className="seq-icon seq-delay-1">
                <img 
                  src="/images/granite-Photoroom.png" 
                  alt="Rock"
                  style={{ width: '2rem', height: '2rem' }}
                />
              </span>
              <span className="seq-icon seq-delay-2">📄</span>
              <span className="seq-icon seq-delay-3">✂️</span>
            </div>
            <div className="lock-wrap">
              <svg className="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
          </div>
        </div>
      )}
      
      {/* FHE Status */}
      {fheError && (
        <div className="mb-6 bg-red-900/30 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
          <strong>FHE Error:</strong> {fheError}
        </div>
      )}

      {!fheInitialized && !fheError && (
        <div className="mb-6 bg-yellow-900/30 border border-yellow-500/50 text-yellow-300 px-4 py-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>FHE not initialized. Please go to Create Game tab first.</span>
          </div>
        </div>
      )}


      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <h3 className="text-2xl font-bold text-white mb-1">Join Active Games</h3>
          <p className="text-slate-400">Select a game and choose your choice to join</p>
        </div>
        <button className="refresh-btn ml-4" onClick={() => { setPage(1); loadPage(); }} disabled={loading} aria-label="Refresh Active Games">
          <svg className={`refresh-icon ${loading ? 'spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7"/>
            <polyline points="21 3 21 9 15 9"/>
          </svg>
        </button>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-400">Page {page}</span>
          <span className="text-sm text-slate-500">•</span>
          <span className="text-sm text-slate-400">{rows.length} games</span>
        </div>
        <div className="flex space-x-2">
          <button 
            className="button" 
            disabled={page===1 || loading} 
            onClick={() => setPage((p)=>Math.max(1,p-1))}
          >
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>Prev</span></span>
          </button>
          <button 
            className="button" 
            disabled={rows.length < pageSize || loading} 
            onClick={() => setPage((p)=>p+1)}
          >
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>Next</span></span>
          </button>
        </div>
      </div>

      {/* Games List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-slate-400">Loading games...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎮</div>
            <h4 className="text-xl font-semibold text-white mb-2">No Active Games</h4>
            <p className="text-slate-400">Be the first to create a game!</p>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id.toString()} className="game-card p-6">
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 items-center">
                {/* Game Info */}
                <div className="lg:col-span-2">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-teal-600/20 flex items-center justify-center">
                      <span className="text-2xl">🎯</span>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">Game #{row.id.toString()}</h4>
                      <p className="text-sm text-slate-400">
                        Host: {row.opponent?.slice(0,6)}...{row.opponent?.slice(-4)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Time */}
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-1">Created</div>
                  <div className="text-sm text-white font-medium">
                    {row.time ? row.time.toLocaleString() : '-'}
                  </div>
                </div>

                {/* Bet Amount */}
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-1">Bet Amount</div>
                  <div className="text-lg font-bold text-teal-400">
                    {row.bet} ETH
                  </div>
                </div>

                {/* Move Selection */}
                <div className="text-center flex flex-col justify-end">
                  <div className="text-sm text-slate-400 mb-2">Your Choice</div>
                  <ChoiceSelector
                    value={selectedMoves[row.id?.toString()]}
                    onChange={(v)=>setSelectedMoves((m)=>({ ...m, [row.id?.toString()]: v }))}
                  />
                </div>

                {/* Join Button */}
                <div className="text-center flex items-end justify-center">
                  <button 
                    className="button" 
                    onClick={()=>joinGame(row)}
                    disabled={selectedMoves[row.id?.toString()] === undefined || !fheInitialized}
                  >
                    <span className="shadow"></span>
                    <span className="edge"></span>
                    <span className="front">
                      <span className="flex items-center justify-center space-x-2">
                        <span>🎮</span>
                        <span>Join Game</span>
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const GamePanel = ({ contract, account, provider, onBalanceUpdate }) => {
  const [tab, setTab] = useState(TABS.CREATE);
  const [fheInitialized, setFheInitialized] = useState(false);
  const [fheError, setFheError] = useState(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  return (
    <div className="game-card p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-3">
          <button className="button" onClick={()=>setTab(TABS.CREATE)} aria-label="Create Game">
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>Create Game</span></span>
          </button>
          <button className="button" onClick={()=>setTab(TABS.JOIN)} aria-label="Join Game">
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>Join Game</span></span>
          </button>
          <button className="button" onClick={()=>setTab(TABS.MINE)} aria-label="My Games">
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>My Games</span></span>
          </button>
          <button className="button" onClick={()=>setTab(TABS.COMPLETED)} aria-label="Completed">
            <span className="shadow"></span>
            <span className="edge"></span>
            <span className="front"><span>Completed</span></span>
          </button>
        </div>
        <button
          onClick={() => setShowHowToPlay(true)}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
        >
          How to Play
        </button>
      </div>

      {tab === TABS.CREATE && (
        <GameInterface 
          contract={contract} 
          account={account} 
          provider={provider} 
          onBalanceUpdate={onBalanceUpdate}
          onFHEStatusChange={(initialized, error) => {
            setFheInitialized(initialized);
            setFheError(error);
          }}
        />
      )}

      {tab === TABS.JOIN && (
        <ActiveGamesList 
          contract={contract} 
          account={account} 
          onJoined={onBalanceUpdate}
          fheInitialized={fheInitialized}
          fheError={fheError}
        />
      )}

      {tab === TABS.MINE && (
        <MyGamesList contract={contract} account={account} />
      )}

      {tab === TABS.COMPLETED && (
        <CompletedGamesList contract={contract} account={account} />
      )}

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowHowToPlay(false);
            }
          }}
        >
          <div 
            className="bg-slate-800 rounded-xl p-8 w-full max-w-4xl mx-4 shadow-2xl border border-slate-600/50 animate-slideUp max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h2 className="text-3xl font-bold text-white">How to Play</h2>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 hover:scale-105"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-8 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 pr-2">
              {/* Game Overview */}
              <div className="bg-slate-700/50 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  <span className="text-2xl mr-3">🎮</span>
                  Game Overview
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  Rock Paper Scissors is a classic game where two players simultaneously choose one of three options: 
                  Rock (🗿), Paper (📄), or Scissors (✂️). The winner is determined by the traditional rules:
                </p>
                <ul className="mt-4 space-y-2 text-slate-300">
                  <li className="flex items-center">
                    <span className="text-2xl mr-3">🗿</span>
                    <span><strong>Rock</strong> beats Scissors</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-2xl mr-3">📄</span>
                    <span><strong>Paper</strong> beats Rock</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-2xl mr-3">✂️</span>
                    <span><strong>Scissors</strong> beats Paper</span>
                  </li>
                </ul>
              </div>

              {/* FHE Technology */}
              <div className="bg-slate-700/50 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  <span className="text-2xl mr-3">🔐</span>
                  FHE (Fully Homomorphic Encryption) Technology
                </h3>
                <p className="text-slate-300 leading-relaxed mb-4">
                  This game uses cutting-edge FHE technology to ensure complete privacy. Your moves are encrypted 
                  before being sent to the blockchain, making it impossible for anyone (including the contract) 
                  to see your choice until both players have committed.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-slate-600/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-2">🔒 Privacy</h4>
                    <p className="text-sm text-slate-300">Your choice is encrypted and remains secret until the game resolves.</p>
                  </div>
                  <div className="bg-slate-600/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-2">⚡ Speed</h4>
                    <p className="text-sm text-slate-300">FHE allows computation on encrypted data without decryption.</p>
                  </div>
                  <div className="bg-slate-600/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-2">🛡️ Security</h4>
                    <p className="text-sm text-slate-300">No central authority can see or manipulate your moves.</p>
                  </div>
                  <div className="bg-slate-600/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-2">🌐 Decentralized</h4>
                    <p className="text-sm text-slate-300">Runs entirely on blockchain with no trusted third parties.</p>
                  </div>
                </div>
              </div>

              {/* Step by Step Process */}
              <div className="bg-slate-700/50 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  <span className="text-2xl mr-3">📋</span>
                  How It Works - Step by Step
                </h3>
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">1</div>
                    <div>
                      <h4 className="font-semibold text-white mb-2">Create or Join a Game</h4>
                      <p className="text-slate-300">Choose your bet amount and create a new game, or join an existing one from the active games list.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">2</div>
                    <div>
                      <h4 className="font-semibold text-white mb-2">Select Your Choice</h4>
                      <p className="text-slate-300">Choose Rock, Paper, or Scissors. Your choice will be encrypted using FHE technology.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">3</div>
                    <div>
                      <h4 className="font-semibold text-white mb-2">FHE Encryption</h4>
                      <p className="text-slate-300">Your choice is encrypted on-chain using Fully Homomorphic Encryption. This process takes 5-10 seconds.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">4</div>
                    <div>
                      <h4 className="font-semibold text-white mb-2">Wait for Opponent</h4>
                      <p className="text-slate-300">Both players must submit their encrypted choices before the game can be resolved.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">5</div>
                    <div>
                      <h4 className="font-semibold text-white mb-2">Oracle Decryption</h4>
                      <p className="text-slate-300">The FHE oracle decrypts the encrypted choices and determines the winner using on-chain computation.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">6</div>
                    <div>
                      <h4 className="font-semibold text-white mb-2">Results & Payout</h4>
                      <p className="text-slate-300">The winner receives the total pot minus a 2.5% platform fee. In case of a draw, both players get their bets refunded.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Game Rules */}
              <div className="bg-slate-700/50 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  <span className="text-2xl mr-3">📜</span>
                  Game Rules & Features
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-white mb-3">Game Rules</h4>
                    <ul className="space-y-2 text-slate-300">
                      <li>• Minimum bet: 0.01 ETH</li>
                      <li>• Maximum bet: 1.0 ETH</li>
                      <li>• Games expire after 24 hours</li>
                      <li>• Platform fee: 2.5%</li>
                      <li>• No refunds for expired games</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-3">Technical Features</h4>
                    <ul className="space-y-2 text-slate-300">
                      <li>• Built on Sepolia testnet</li>
                      <li>• Uses Zama's FHEVM</li>
                      <li>• Fully decentralized</li>
                      <li>• No trusted third parties</li>
                      <li>• Transparent and verifiable</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-500/20">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  <span className="text-2xl mr-3">💡</span>
                  Pro Tips
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-yellow-400 text-xl">🎯</span>
                    <div>
                      <h4 className="font-semibold text-white">Strategy</h4>
                      <p className="text-sm text-slate-300">Rock Paper Scissors is about reading patterns and psychology, not just luck!</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-green-400 text-xl">⏰</span>
                    <div>
                      <h4 className="font-semibold text-white">Timing</h4>
                      <p className="text-sm text-slate-300">Games resolve within 5-10 seconds after both players submit their choices.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-blue-400 text-xl">🔍</span>
                    <div>
                      <h4 className="font-semibold text-white">Transparency</h4>
                      <p className="text-sm text-slate-300">All game results are verifiable on the blockchain - no hidden mechanics!</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-purple-400 text-xl">🚀</span>
                    <div>
                      <h4 className="font-semibold text-white">Future</h4>
                      <p className="text-sm text-slate-300">This is just the beginning of FHE-powered gaming on blockchain!</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end flex-shrink-0 pt-4 border-t border-slate-700">
              <button
                onClick={() => setShowHowToPlay(false)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium hover:scale-105 transform duration-200"
              >
                Got it! Let's Play
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamePanel;


