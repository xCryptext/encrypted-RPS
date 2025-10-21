import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { GAME_CONSTANTS } from '../config/contract';
import { initializeFheInstance, encryptMove, isFheAvailable } from '../utils/fhe';

const GameInterface = ({ contract, account, provider, onBalanceUpdate, onFHEStatusChange }) => {
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [betAmount, setBetAmount] = useState('0.01');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showEncryptModal, setShowEncryptModal] = useState(false);
  const [messageType, setMessageType] = useState('');
  const [fheInitialized, setFheInitialized] = useState(false);
  const [fheError, setFheError] = useState(null);

  // Contract state
  const [minBet, setMinBet] = useState('0');
  const [maxBet, setMaxBet] = useState('0');
  const [platformFee, setPlatformFee] = useState('0');

  // Initialize FHE
  useEffect(() => {
    const initializeFHE = async () => {
      try {
        if (isFheAvailable()) {
          await initializeFheInstance();
          setFheInitialized(true);
          setFheError(null);
          onFHEStatusChange && onFHEStatusChange(true, null);
        } else {
          setFheError('FHE SDK not available. Please refresh the page.');
          onFHEStatusChange && onFHEStatusChange(false, 'FHE SDK not available. Please refresh the page.');
        }
      } catch (err) {
        console.error('FHE initialization failed:', err);
        setFheError('Failed to initialize FHE. Please check your connection.');
        onFHEStatusChange && onFHEStatusChange(false, 'Failed to initialize FHE. Please check your connection.');
      }
    };

    initializeFHE();
  }, [onFHEStatusChange]);

  // Load contract parameters
  useEffect(() => {
    const loadContractParams = async () => {
      if (contract) {
        try {
          console.log('Loading contract parameters...');
          console.log('Contract address:', contract.target);
          
          // Check if contract is properly deployed by testing a simple call
          const code = await contract.runner.provider.getCode(contract.target);
          if (code === '0x') {
            throw new Error('Contract not deployed at this address');
          }

          // Check network
          const network = await contract.runner.provider.getNetwork();
          console.log('Current network:', network);

          // Try to load contract parameters with retry logic
          let retries = 3;
          let success = false;
          
          while (retries > 0 && !success) {
            try {
              const [minBet, maxBet, platformFee] = await Promise.all([
                contract.minBet(),
                contract.maxBet(),
                contract.platformFeePercent()
              ]);

              console.log('Contract params loaded:', { minBet, maxBet, platformFee });

              setMinBet(ethers.formatEther(minBet));
              setMaxBet(ethers.formatEther(maxBet));
              setPlatformFee(platformFee.toString());
              success = true;
            } catch (retryErr) {
              retries--;
              console.warn(`Retry ${3 - retries}/3 failed:`, retryErr.message);
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
              } else {
                throw retryErr;
              }
            }
          }
        } catch (err) {
          console.error('Error loading contract params:', err);
          
          // Set default values if contract params can't be loaded
          if (err.message.includes('could not decode result data') || 
              err.message.includes('Contract not deployed') ||
              err.message.includes('BAD_DATA')) {
            console.warn('Using default contract parameters');
            setMinBet('0.001'); // Default minimum bet
            setMaxBet('0.1');   // Default maximum bet
            setPlatformFee('5'); // Default platform fee 5%
            showMessage('Contract parameters not available, using defaults', 'warning');
          } else {
            showMessage('Failed to load contract parameters', 'error');
          }
        }
      }
    };

    loadContractParams();
  }, [contract]);

  const showMessage = (text, type = 'info') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 5000);
  };

  const createGame = async () => {
    if (!selectedChoice && selectedChoice !== 0) {
      showMessage('Please select a choice', 'error');
      return;
    }

    if (!fheInitialized) {
      showMessage('FHE not initialized. Please wait and try again.', 'error');
      return;
    }

    const betAmountNum = parseFloat(betAmount);
    const minBetNum = parseFloat(minBet);
    const maxBetNum = parseFloat(maxBet);
    
    // Check if contract parameters are loaded
    if (minBet === '0' || maxBet === '0') {
      showMessage('Loading contract parameters... Please wait.', 'error');
      return;
    }
    
    if (!betAmount || isNaN(betAmountNum) || betAmountNum < minBetNum || betAmountNum > maxBetNum) {
      showMessage(`Bet amount must be between ${minBet} and ${maxBet} ETH`, 'error');
      return;
    }

    try {
      setLoading(true);
      setMessage('Encrypting move and creating game...');
      setShowEncryptModal(true);

      // Get contract address
      const contractAddress = await contract.getAddress();

      // Encrypt the choice using FHE
      const encryptedData = await encryptMove(
        selectedChoice,
        contractAddress,
        account
      );
      // Encryption finished: switch modal to wallet approval stage
      showMessage('Choice encrypted. Waiting for wallet confirmation...', 'info');

      const moveDeadline = 86400; // 24 hours

      const tx = await contract.createGame(
        encryptedData.handle,  // externalEuint8
        encryptedData.proof,   // bytes proof
        moveDeadline,
        ethers.parseEther(betAmount),
        {
          value: ethers.parseEther(betAmount)
        }
      );
      await tx.wait();
      
      showMessage('Game created successfully with encrypted choice!', 'success');
      setSelectedChoice(null);
      setBetAmount('0.01');
      
      if (onBalanceUpdate) {
        onBalanceUpdate();
      }
    } catch (err) {
      console.error('Error creating game:', err);
      showMessage('Failed to create game. Please try again.', 'error');
    } finally {
      setLoading(false);
      setShowEncryptModal(false);
    }
  };


  const choices = [
    { value: GAME_CONSTANTS.ROCK, emoji: '🗿', name: 'Rock', isImage: true, imageUrl: '/images/granite-Photoroom.png' },
    { value: GAME_CONSTANTS.PAPER, emoji: '📄', name: 'Paper' },
    { value: GAME_CONSTANTS.SCISSORS, emoji: '✂️', name: 'Scissors' }
  ];

  return (
    <div className="space-y-8">
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
        <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
          <strong>FHE Error:</strong> {fheError}
        </div>
      )}

      {!fheInitialized && !fheError && (
        <div className="mb-6 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="spinner"></div>
            <span>Initializing FHE encryption...</span>
          </div>
        </div>
      )}


      {/* Game Creation */}
      <div className="game-card p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Create New Game</h2>
          <p className="text-slate-400">Choose your choice and set the bet amount</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Game Creation */}
          <div className="space-y-6">
            {/* Move Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-4">
                Choose Your choice
              </label>
              <div className="flex justify-center space-x-4">
                {choices.map((choice) => (
                  <button
                    key={choice.value}
                    onClick={() => setSelectedChoice(choice.value)}
                    className={`move-option group ${
                      selectedChoice === choice.value ? 'selected' : ''
                    }`}
                  >
                    {choice.isImage ? (
                      <img 
                        src={choice.imageUrl} 
                        alt={choice.name}
                        className="group-hover:scale-110 transition-transform duration-200"
                        style={{ width: '3rem', height: '3rem' }}
                      />
                    ) : (
                      <span className="group-hover:scale-110 transition-transform duration-200">{choice.emoji}</span>
                    )}
                  </button>
                ))}
              </div>
              {selectedChoice !== null && (
                <div className="text-center mt-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-teal-900/30 text-teal-300">
                    {choices.find(c => c.value === selectedChoice)?.isImage ? (
                      <img 
                        src={choices.find(c => c.value === selectedChoice)?.imageUrl} 
                        alt={choices.find(c => c.value === selectedChoice)?.name}
                        className="mr-2"
                        style={{ width: '1.5rem', height: '1.5rem' }}
                      />
                    ) : (
                      <span className="mr-2 text-lg">{choices.find(c => c.value === selectedChoice)?.emoji}</span>
                    )}
                    {choices.find(c => c.value === selectedChoice)?.name}
                  </span>
                </div>
              )}
            </div>

            {/* Bet Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Bet Amount (ETH)
              </label>
              <div className="relative mb-3">
                <input
                  type="number"
                  step="0.001"
                  min={parseFloat(minBet)}
                  max={parseFloat(maxBet)}
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-slate-800/90 border-2 border-slate-600/50 text-center text-xl font-bold text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                  placeholder={`Min: ${minBet} ETH, Max: ${maxBet} ETH`}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                  <span className="text-teal-400 text-sm font-semibold bg-slate-700/50 px-2 py-1 rounded-md">ETH</span>
                </div>
              </div>
              
              {/* Quick Bet Buttons */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[0.01, 0.05, 0.1, 0.25, 0.5, 1.0].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount.toString())}
                    className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                      parseFloat(betAmount) === amount
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {amount} ETH
                  </button>
                ))}
              </div>
              
              <div className="flex justify-between text-xs text-slate-500">
                <span>Min: {minBet} ETH</span>
                <span>Max: {maxBet} ETH</span>
              </div>
            </div>

            {/* Create Game Button */}
            <div className="text-center">
              <button
                onClick={createGame}
                className="button w-full"
                disabled={loading || selectedChoice === null || !fheInitialized}
              >
                <span className="shadow"></span>
                <span className="edge"></span>
                <span className="front">
                  <span className="flex items-center justify-center space-x-2">
                    {loading && <div className="spinner w-4 h-4"></div>}
                    <span>{loading ? 'Creating Game...' : 'Create Game'}</span>
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Right Side - Game Info */}
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-white mb-4">How It Works</h3>
              <div className="space-y-4 text-sm text-slate-300">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">1</div>
                  <div>
                    <p className="font-medium text-white">Choose Your Choice</p>
                    <p className="text-slate-400">Select Rock, Paper, or Scissors. Your choice is encrypted using FHE technology.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">2</div>
                  <div>
                    <p className="font-medium text-white">Set Bet Amount</p>
                    <p className="text-slate-400">Choose how much ETH you want to wager. Both players must match this amount.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">3</div>
                  <div>
                    <p className="font-medium text-white">Wait for Opponent</p>
                    <p className="text-slate-400">Your game will be listed for others to join. First to join becomes your opponent.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">4</div>
                  <div>
                    <p className="font-medium text-white">Automatic Resolution</p>
                    <p className="text-slate-400">Oracle decrypts moves and determines winner. Winner takes all ETH minus platform fees.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Game Stats */}
            <div className="bg-slate-800/40 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-white mb-3">Game Parameters</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Platform Fee:</span>
                  <span className="text-white font-medium">{platformFee} bps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Min Bet:</span>
                  <span className="text-white font-medium">{minBet} ETH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Bet:</span>
                  <span className="text-white font-medium">{maxBet} ETH</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Join Existing Game moved to GamePanel Join tab */}


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

export default GameInterface;
