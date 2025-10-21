import React, { useState, useEffect } from 'react';

const WalletConnect = ({ onConnect, loading }) => {
  const [metamaskAvailable, setMetamaskAvailable] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if MetaMask is available
    if (typeof window.ethereum !== 'undefined') {
      setMetamaskAvailable(true);
      setError('');
    } else {
      setMetamaskAvailable(false);
      setError('MetaMask not detected. Please install MetaMask extension to continue.');
    }
  }, []);
  const handleConnect = () => {
    console.log('WalletConnect: Connect button clicked');
    console.log('onConnect function:', typeof onConnect);
    if (typeof onConnect === 'function') {
      onConnect();
    } else {
      console.error('onConnect is not a function');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[40vh] py-8">
      <div className="game-card max-w-lg w-full p-6 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-2xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Welcome to Rock Paper Scissors FHE
          </h2>
          <p className="text-gray-600">
            Connect your wallet to start playing the world's first fully homomorphic encrypted Rock Paper Scissors game!
          </p>
        </div>

        <div className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    MetaMask Required
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                    <p className="mt-1">
                      <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-red-600">
                        Download MetaMask here
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h3 className="font-semibold text-blue-800 mb-1 text-sm">🔒 Privacy First</h3>
              <p className="text-blue-700 text-xs">
                Your moves are encrypted using Zama's FHEVM technology.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <h3 className="font-semibold text-green-800 mb-1 text-sm">💰 Bet ETH</h3>
              <p className="text-green-700 text-xs">
                Place bets in ETH and win prizes on the blockchain.
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <h3 className="font-semibold text-purple-800 mb-1 text-sm">⚡ Fast & Secure</h3>
              <p className="text-purple-700 text-xs">
                Built on Sepolia testnet with FHE technology.
              </p>
            </div>
          </div>

          <button
            onClick={handleConnect}
            className="w-full btn-primary text-lg py-3"
            disabled={loading || !metamaskAvailable}
          >
            {loading ? 'Connecting...' : 
             !metamaskAvailable ? 'MetaMask Not Available' : 
             'Connect MetaMask Wallet'}
          </button>

          <div className="text-xs text-gray-500">
            <p>Make sure you're connected to Sepolia testnet • You'll need some Sepolia ETH to play</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletConnect;
