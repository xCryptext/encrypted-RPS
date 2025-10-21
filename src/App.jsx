import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import Header from './components/Header.jsx';
import WalletConnect from './components/WalletConnect.jsx';
import GamePanel from './components/GamePanel.jsx';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './config/contract';

function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [, setError] = useState(null);

  // Contract configuration
  const CONTRACT_CONFIG = {
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI
  };

  // Connect wallet
  const connectWallet = useCallback(async (isInitialLoad = false) => {
    try {
      console.log('connectWallet called, isInitialLoad:', isInitialLoad);
      
      if (!isInitialLoad) {
        setLoading(true);
      }
      setError(null);

      // Check if MetaMask is installed
      if (typeof window.ethereum === 'undefined') {
        console.error('MetaMask not detected');
        setError('MetaMask not detected. Please install MetaMask extension.');
        return;
      }

      console.log('MetaMask detected, version:', window.ethereum.version);
      console.log('Available providers:', window.ethereum.providers);

      if (window.ethereum) {
        // Check if already connected
        let accounts = await window.ethereum.request({
          method: 'eth_accounts'
        });

        // If not connected and not initial load, request connection
        if (accounts.length === 0 && !isInitialLoad) {
          accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
          });
        }

        if (accounts.length > 0) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          
          // Verify contract address is valid
          if (CONTRACT_CONFIG.address === "0x0000000000000000000000000000000000000000") {
            throw new Error('Contract address not configured. Please set VITE_CONTRACT_ADDRESS in .env file.');
          }
          
          // Check if contract is deployed
          const code = await provider.getCode(CONTRACT_CONFIG.address);
          if (code === '0x') {
            throw new Error(`Contract not deployed at address: ${CONTRACT_CONFIG.address}`);
          }
          
          const contract = new ethers.Contract(
            CONTRACT_CONFIG.address,
            CONTRACT_CONFIG.abi,
            signer
          );

          setAccount(accounts[0]);
          setProvider(provider);
          setContract(contract);

          // Get balance
          const balance = await provider.getBalance(accounts[0]);
          setBalance(ethers.formatEther(balance));

          console.log('Wallet connected:', accounts[0]);
          console.log('Contract address:', CONTRACT_CONFIG.address);
        }
      } else {
        setError('MetaMask not detected. Please install MetaMask extension.');
      }
    } catch (err) {
      console.error('Error connecting wallet:', err);
      if (err.code === 4001) {
        setError('Connection rejected. Please try again and approve the connection.');
      } else if (err.code === -32002) {
        setError('Connection request already pending. Please check MetaMask.');
      } else {
        setError('Failed to connect wallet. Please refresh the page and try again.');
      }
    } finally {
      if (!isInitialLoad) {
        setLoading(false);
      }
    }
  }, [CONTRACT_CONFIG.address, CONTRACT_CONFIG.abi]);

  // Disconnect wallet
  const disconnectWallet = () => {
    setAccount(null);
    setProvider(null);
    setContract(null);
    setBalance('0');
    setError(null);
  };

  // Handle withdraw success
  const handleWithdrawSuccess = async () => {
    // Update balance after withdrawal
    await updateBalance();
    console.log('Funds withdrawn successfully');
  };

  // Check if wallet is already connected on page load
  const checkWalletConnection = useCallback(async () => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts'
        });

        if (accounts.length > 0) {
          console.log('Wallet already connected, setting up contract...');
          await connectWallet(true); // Pass true for initial load
        }
      }
    } catch (err) {
      console.error('Error checking wallet connection:', err);
    } finally {
      setInitializing(false);
    }
  }, [connectWallet]);

  // Update balance
  const updateBalance = useCallback(async () => {
    if (provider && account) {
      try {
        const balance = await provider.getBalance(account);
        setBalance(ethers.formatEther(balance));
      } catch (err) {
        console.error('Error updating balance:', err);
      }
    }
  }, [provider, account]);

  // Check wallet connection on page load
  useEffect(() => {
    checkWalletConnection();
  }, [checkWalletConnection]);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          connectWallet();
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
      }
    };
  }, [connectWallet]);

  // Update balance periodically
  useEffect(() => {
    if (account) {
      updateBalance();
      const interval = setInterval(updateBalance, 10000); // Update every 10 seconds
      return () => clearInterval(interval);
    }
  }, [account, updateBalance]);

  // Show loading screen during initialization
  if (initializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading application...</p>
          <p className="text-gray-400 text-sm mt-2">Checking wallet connection</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <Header 
        account={account} 
        balance={balance} 
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        contract={contract}
        onWithdrawSuccess={handleWithdrawSuccess}
        loading={loading}
      />
      
      <main className="container mx-auto px-4 py-4">

        {!account ? (
          <WalletConnect onConnect={connectWallet} loading={loading} />
        ) : (
          <GamePanel contract={contract} account={account} provider={provider} onBalanceUpdate={updateBalance} />
        )}
      </main>
    </div>
  );
}

export default App;