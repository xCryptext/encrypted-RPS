import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ethers } from 'ethers';

const WithdrawModal = ({ isOpen, onClose, contract, account, onWithdrawSuccess }) => {
  const [withdrawableBalance, setWithdrawableBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load withdrawable balance
  useEffect(() => {
    const loadWithdrawableBalance = async () => {
      if (contract && account) {
        try {
          const balance = await contract.withdrawableBalance(account);
          setWithdrawableBalance(ethers.formatEther(balance));
        } catch (err) {
          console.error('Error loading withdrawable balance:', err);
          setError('Failed to load withdrawable balance');
        }
      }
    };

    if (isOpen) {
      loadWithdrawableBalance();
    }
  }, [isOpen, contract, account]);

  // Handle withdraw
  const handleWithdraw = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      const tx = await contract.withdraw();
      await tx.wait();
      
      setSuccess(true);
      onWithdrawSuccess && onWithdrawSuccess();
      
      // Reload balance
      const balance = await contract.withdrawableBalance(account);
      setWithdrawableBalance(ethers.formatEther(balance));
      
      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
      
    } catch (err) {
      console.error('Error withdrawing funds:', err);
      setError('Failed to withdraw funds. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const hasWithdrawableFunds = parseFloat(withdrawableBalance) > 0;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center animate-fadeIn modal-overlay">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl border border-slate-600/50 animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Withdraw Funds</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Balance Display */}
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-center">
              <div className="text-slate-400 text-sm mb-2">Available to Withdraw</div>
              <div className="text-3xl font-bold text-white">
                {parseFloat(withdrawableBalance).toFixed(6)} ETH
              </div>
              <div className="text-slate-400 text-sm mt-1">
                ≈ ${(parseFloat(withdrawableBalance) * 2000).toFixed(2)} USD
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3">
              <div className="text-red-300 text-sm">{error}</div>
            </div>
          )}

          {success && (
            <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3">
              <div className="text-green-300 text-sm">Withdrawal successful!</div>
            </div>
          )}

          {/* Info */}
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3">
            <div className="text-blue-300 text-sm">
              <div className="font-medium mb-1">How it works:</div>
              <ul className="text-xs space-y-1">
                <li>• Withdraw winnings from completed games</li>
                <li>• Withdraw refunds from expired games</li>
                <li>• Funds are sent directly to your wallet</li>
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            
            <button
              onClick={handleWithdraw}
              className="flex-1 btn-success"
              disabled={loading || !hasWithdrawableFunds}
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="spinner"></div>
                  <span>Withdrawing...</span>
                </div>
              ) : (
                'Withdraw'
              )}
            </button>
          </div>

          {/* No Funds Message */}
          {!hasWithdrawableFunds && (
            <div className="text-center text-slate-400 text-sm">
              No funds available for withdrawal
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WithdrawModal;
