import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getMoveName, getResultText } from '../config/contract';

const GameList = ({ contract, account, provider }) => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const showMessage = (text, type = 'info') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 5000);
  };

  const loadGames = async () => {
    if (!contract || !account) return;

    try {
      setLoading(true);

      const counter = await contract.gameIdCounter();
      const ids = Array.from({ length: Number(counter) }, (_, i) => BigInt(i + 1));

      const gameDetails = await Promise.all(
        ids.map(async (gameId) => {
          try {
            const g = await contract.games(gameId);
            // Filter only the user's games
            const isUserGame =
              g.player1?.toLowerCase() === account.toLowerCase() ||
              (g.player2 && g.player2.toLowerCase() === account.toLowerCase());
            if (!isUserGame) return null;

            const moveDeadlineMs = g.moveDeadline ? Number(g.moveDeadline) * 1000 : 0;
            const endTimeMs = g.endTime ? Number(g.endTime) * 1000 : 0;

            return {
              id: gameId.toString(),
              player1: g.player1,
              player2: g.player2,
              betAmount: ethers.formatEther(g.betAmount),
              totalPot: ethers.formatEther(g.totalPot),
              payoutAmount: ethers.formatEther(g.payoutAmount ?? 0n),
              moveDeadline: moveDeadlineMs ? new Date(moveDeadlineMs) : null,
              move1Submitted: g.move1Submitted,
              move2Submitted: g.move2Submitted,
              decryptionRequested: g.decryptionRequested,
              decryptionCompleted: g.decryptionCompleted,
              resultCode: Number(g.resultCode ?? 255),
              winner: g.winner,
              isExpired: g.isExpired,
              refunded: g.refunded,
              payoutClaimedP1: g.payoutClaimedP1,
              payoutClaimedP2: g.payoutClaimedP2,
              endTime: endTimeMs ? new Date(endTimeMs) : null,
              isCompleted: !!g.decryptionCompleted || !!g.isExpired
            };
          } catch (err) {
            console.error(`Error loading game ${gameId}:`, err);
            return null;
          }
        })
      );

      setGames(gameDetails.filter(Boolean));
    } catch (err) {
      console.error('Error loading games:', err);
      showMessage('Failed to load games', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Manual requestDecryption/expire/claim are not supported in this contract version.

  const withdraw = async () => {
    try {
      setLoading(true);
      setMessage('Withdrawing funds...');

      const tx = await contract.withdraw();
      await tx.wait();
      
      showMessage('Funds withdrawn successfully!', 'success');
      loadGames();
    } catch (err) {
      console.error('Error withdrawing:', err);
      showMessage('Failed to withdraw funds', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getGameStatus = (game) => {
    if (game.isExpired) return { text: 'Expired', class: 'status-error' };
    if (game.decryptionCompleted) return { text: 'Completed', class: 'status-success' };
    if (game.decryptionRequested) return { text: 'Decrypting...', class: 'status-pending' };
    if (game.move1Submitted && game.move2Submitted) return { text: 'Ready to Decrypt', class: 'status-pending' };
    if (!game.player2 || game.player2 === '0x0000000000000000000000000000000000000000') return { text: 'Waiting for Player 2', class: 'status-warning' };
    if (game.moveDeadline && game.moveDeadline < new Date()) return { text: 'Expired', class: 'status-error' };
    return { text: 'Active', class: 'status-pending' };
  };

  // Buttons controlled at app header (withdraw). No per-game actions here for this contract.

  const getGameResult = (game) => {
    if (!game.isCompleted) return null;

    const isPlayer1 = game.player1.toLowerCase() === account.toLowerCase();
    const isPlayer2 = game.player2?.toLowerCase && game.player2.toLowerCase() === account.toLowerCase();

    // Contract mapping: 0 = P1 wins, 1 = P2 wins, 2 = Draw
    if (game.resultCode === 2) {
      return { text: 'Draw - Refunded', class: 'result-draw' };
    } else if (game.resultCode === 0) {
      if (isPlayer1) return { text: 'You Won!', class: 'result-win' };
      if (isPlayer2) return { text: 'You Lost', class: 'result-lose' };
    } else if (game.resultCode === 1) {
      if (isPlayer2) return { text: 'You Won!', class: 'result-win' };
      if (isPlayer1) return { text: 'You Lost', class: 'result-lose' };
    }
    return { text: 'Unknown', class: 'result-unknown' };
  };

  useEffect(() => {
    loadGames();
  }, [contract, account]);

  if (loading && games.length === 0) {
    return (
      <div className="game-card p-6 text-center">
        <div className="spinner mx-auto mb-4"></div>
        <p className="text-gray-600">Loading games...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Your Games</h2>
        <button
          onClick={loadGames}
          className="btn-secondary"
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {games.length === 0 ? (
        <div className="game-card p-8 text-center">
          <div className="text-6xl mb-4">🎮</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No Games Yet</h3>
          <p className="text-gray-600">Create a new game or join an existing one to get started!</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {games.map((game) => {
            const status = getGameStatus(game);
            const isPlayer1 = game.player1.toLowerCase() === account.toLowerCase();
            const isPlayer2 = game.player2.toLowerCase() === account.toLowerCase();
            
            return (
              <div key={game.id} className="game-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      Game #{game.id}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Bet: {game.betAmount} ETH | Total Pot: {game.totalPot} ETH
                    </p>
                    {game.isCompleted && (
                      <p className="text-sm text-gray-600">
                        Payout: {game.payoutAmount} ETH
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.class}`}>
                      {status.text}
                    </span>
                    {game.isCompleted && (
                      <div className="mt-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getGameResult(game)?.class}`}>
                          {getGameResult(game)?.text}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-gray-600">Player 1:</span>
                    <span className="ml-2 font-medium">
                      {game.player1.slice(0, 6)}...{game.player1.slice(-4)}
                      {isPlayer1 && ' (You)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Player 2:</span>
                    <span className="ml-2 font-medium">
                      {game.player2 ? `${game.player2.slice(0, 6)}...${game.player2.slice(-4)}` : 'Waiting...'}
                      {isPlayer2 && ' (You)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Move 1:</span>
                    <span className="ml-2 font-medium">
                      {game.move1Submitted ? '✅ Submitted' : '❌ Not submitted'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Move 2:</span>
                    <span className="ml-2 font-medium">
                      {game.move2Submitted ? '✅ Submitted' : '❌ Not submitted'}
                    </span>
                  </div>
                </div>

                {game.isCompleted && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="font-semibold text-gray-800 mb-2">Game Result</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Winner:</span>
                        <span className="ml-2 font-medium">
                          {game.winner && game.winner !== '0x0000000000000000000000000000000000000000' 
                            ? `${game.winner.slice(0, 6)}...${game.winner.slice(-4)}`
                            : 'Draw'
                          }
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Result Code:</span>
                        <span className="ml-2 font-medium">
                          {game.resultCode === 2 ? 'Draw' : 
                           game.resultCode === 0 ? 'Player 1 Wins' : 
                           game.resultCode === 1 ? 'Player 2 Wins' : 'Unknown'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">End Time:</span>
                        <span className="ml-2 font-medium">
                          {game.endTime ? game.endTime.toLocaleString() : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Refunded:</span>
                        <span className="ml-2 font-medium">
                          {game.refunded ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions are handled globally (e.g., Withdraw in header) */}
              </div>
            );
          })}
        </div>
      )}

      {/* Message Display */}
      {message && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
          messageType === 'error' ? 'bg-red-100 text-red-700' :
          messageType === 'success' ? 'bg-green-100 text-green-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default GameList;
