import React, { useState } from 'react';
import WithdrawModal from './WithdrawModal';

const Header = ({ account, balance, onConnect, onDisconnect, contract, onWithdrawSuccess, loading }) => {
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleConnect = () => {
    console.log('Header: Connect button clicked');
    console.log('onConnect function:', typeof onConnect);
    if (typeof onConnect === 'function') {
      onConnect();
    } else {
      console.error('onConnect is not a function');
    }
  };

  return (
    <header className="bg-gray-900/80 backdrop-blur-md border-b border-gray-700/50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-2xl font-bold">🎮</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Rock Paper Scissors FHE</h1>
              <p className="text-blue-100 text-sm">Fully Homomorphic Encrypted Game</p>
            </div>
          </div>

          {/* Wallet Section */}
          <div className="flex items-center space-x-4">
            {account ? (
              <div className="flex items-center space-x-4">
                {/* Balance */}
                <div className="bg-gray-800/60 rounded-lg px-4 py-2">
                  <div className="text-white text-sm font-medium">
                    Balance: {parseFloat(balance).toFixed(4)} ETH
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="bg-gray-800/60 rounded-lg px-4 py-2">
                  <div className="text-white text-sm font-medium">
                    {formatAddress(account)}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowWithdrawModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    disabled={loading}
                  >
                    Withdraw
                  </button>
                  
                  <button
                    onClick={onDisconnect}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    disabled={loading}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                className="btn-wallet"
                disabled={loading}
              >
                <svg className="sparkle" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="currentColor"/>
                </svg>
                <span className="text">
                  {loading ? 'Connecting...' : 'Connect Wallet'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        contract={contract}
        account={account}
        onWithdrawSuccess={onWithdrawSuccess}
      />
    </header>
  );
};

export default Header;
