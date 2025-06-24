import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import contractABI from './abi.json';
import './App.css';

// Pinata configuration
const PINATA_API_KEY = '223553f88ea60420fae4';
const PINATA_SECRET_KEY = '36b531be959f28db2b3a9b8672fe4243dd82ccf518624ebbffd1b5b1280ec78d';

// Your deployed contract address
const CONTRACT_ADDRESS = '0x0A47388e92d2c5aFF354CbCCC41fb8f80a0ef9Db';

// Contract owner address (replace with your actual owner address)
const OWNER_ADDRESS = '0x7f21d6db0b059496ee1c0810898e35c125a714ab';

// Multiple IPFS gateways for better image loading reliability
const IPFS_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/',
    'https://gateway.ipfs.io/ipfs/'
];

const PropertyNFTMarketplace = () => {
    // State management
    const [account, setAccount] = useState('');
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    
    // Property creation states
    const [propertyForm, setPropertyForm] = useState({
        name: '',
        description: '',
        propertyAddress: '',
        ownerDetails: '',
        priceInETH: ''
    });
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    
    // External NFT listing states
    const [externalNFTForm, setExternalNFTForm] = useState({
        nftContract: '',
        tokenId: '',
        name: '',
        description: '',
        propertyAddress: '',
        ownerDetails: '',
        priceInETH: ''
    });
    const [externalImage, setExternalImage] = useState(null);
    const [externalImagePreview, setExternalImagePreview] = useState('');
    
    // Marketplace states
    const [listedProperties, setListedProperties] = useState([]);
    const [userProperties, setUserProperties] = useState([]);
    const [userExternalListings, setUserExternalListings] = useState([]);
    const [activeTab, setActiveTab] = useState('marketplace');
    const [contractBalance, setContractBalance] = useState('0');

    // Initialize Web3 connection
    useEffect(() => {
        initializeWeb3();
        
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
            window.ethereum.on('disconnect', handleDisconnect);
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
                window.ethereum.removeListener('chainChanged', handleChainChanged);
                window.ethereum.removeListener('disconnect', handleDisconnect);
            }
        };
    }, []);

    // Load data when account changes
    useEffect(() => {
        if (contract && account) {
            loadMarketplaceData();
            loadUserProperties();
            loadUserExternalListings();
            loadContractBalance();
        }
    }, [contract, account]);

    const initializeWeb3 = async () => {
        try {
            if (window.ethereum) {
                const web3Provider = new ethers.BrowserProvider(window.ethereum);
                setProvider(web3Provider);
                
                const accounts = await window.ethereum.request({
                    method: 'eth_accounts'
                });
                
                if (accounts.length > 0) {
                    await connectWallet();
                }
            } else {
                setError('Please install MetaMask to use this application');
            }
        } catch (err) {
            console.error('Web3 initialization error:', err);
            setError('Failed to initialize Web3: ' + err.message);
        }
    };

    const handleAccountsChanged = async (accounts) => {
        if (accounts.length === 0) {
            setAccount('');
            setContract(null);
            setSigner(null);
            setListedProperties([]);
            setUserProperties([]);
            setUserExternalListings([]);
        } else if (accounts[0] !== account) {
            await connectWallet();
        }
    };

    const handleChainChanged = (chainId) => {
        window.location.reload();
    };

    const handleDisconnect = () => {
        setAccount('');
        setContract(null);
        setSigner(null);
        setListedProperties([]);
        setUserProperties([]);
        setUserExternalListings([]);
    };

    const connectWallet = async () => {
        try {
            setIsConnecting(true);
            setError('');
            
            if (!window.ethereum) {
                throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
            }

            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
            
            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found. Please unlock MetaMask and try again.');
            }
            
            const web3Provider = new ethers.BrowserProvider(window.ethereum);
            const web3Signer = await web3Provider.getSigner();
            
            const signerAddress = await web3Signer.getAddress();
            if (signerAddress.toLowerCase() !== accounts[0].toLowerCase()) {
                throw new Error('Signer address mismatch. Please refresh and try again.');
            }
            
            const network = await web3Provider.getNetwork();
            console.log('Connected to network:', network.name, 'Chain ID:', network.chainId);
            
            setProvider(web3Provider);
            setSigner(web3Signer);
            setAccount(accounts[0]);
            
            try {
                const contractInstance = new ethers.Contract(
                    CONTRACT_ADDRESS,
                    contractABI,
                    web3Signer
                );
                
                const contractName = await contractInstance.name();
                console.log('Connected to contract:', contractName);
                
                setContract(contractInstance);
                setSuccess('Wallet connected successfully!');
                
            } catch (contractError) {
                console.error('Contract connection error:', contractError);
                throw new Error(`Failed to connect to contract. Please verify the contract is deployed on this network.`);
            }
            
        } catch (err) {
            console.error('Wallet connection error:', err);
            
            if (err.code === 4001) {
                setError('Connection rejected. Please approve the connection request in MetaMask.');
            } else if (err.code === -32002) {
                setError('Connection request already pending. Please check MetaMask.');
            } else {
                setError(err.message || 'Failed to connect wallet');
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectWallet = () => {
        setAccount('');
        setContract(null);
        setSigner(null);
        setProvider(null);
        setListedProperties([]);
        setUserProperties([]);
        setUserExternalListings([]);
        setSuccess('Wallet disconnected successfully');
    };

    // Helper function to check if contract method exists
    const hasContractMethod = (methodName) => {
        if (!contract) return false;
        try {
            return contract.interface.hasFunction(methodName);
        } catch (err) {
            console.warn(`Method ${methodName} not found in contract:`, err);
            return false;
        }
    };

    // Helper function to check if user is owner
    const isOwner = () => {
        return account && account.toLowerCase() === OWNER_ADDRESS.toLowerCase();
    };

    // Helper function to get working IPFS URL with multiple gateway fallbacks
    const getWorkingImageUrl = (ipfsUrl) => {
        if (!ipfsUrl) return 'https://via.placeholder.com/400x250?text=Property+Image';
        
        let hash = '';
        if (ipfsUrl.includes('/ipfs/')) {
            hash = ipfsUrl.split('/ipfs/')[1];
        } else if (ipfsUrl.startsWith('ipfs://')) {
            hash = ipfsUrl.replace('ipfs://', '');
        } else if (ipfsUrl.includes('Qm') || ipfsUrl.includes('bafy')) {
            hash = ipfsUrl;
        }
        
        if (!hash) return 'https://via.placeholder.com/400x250?text=Property+Image';
        
        // Return Pinata gateway URL (most reliable)
        return `https://gateway.pinata.cloud/ipfs/${hash}`;
    };

    // Helper function to format USD price correctly
    const formatUSDPrice = (priceInUSD) => {
        if (!priceInUSD || priceInUSD === '0') return 'Price unavailable';
        
        try {
            // Convert from 8 decimal places to regular number
            const usdValue = parseFloat(priceInUSD) / 100000000;
            return usdValue.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } catch (err) {
            console.error('Error formatting USD price:', err);
            return 'Price unavailable';
        }
    };

    const handleImageUpload = (event, isExternal = false) => {
        const file = event.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setError('Please select a valid image file (JPEG, PNG, GIF, etc.)');
                return;
            }
            
            if (file.size > 10 * 1024 * 1024) {
                setError('File size must be less than 10MB');
                return;
            }
            
            if (isExternal) {
                setExternalImage(file);
                const reader = new FileReader();
                reader.onload = (e) => setExternalImagePreview(e.target.result);
                reader.readAsDataURL(file);
            } else {
                setSelectedImage(file);
                const reader = new FileReader();
                reader.onload = (e) => setImagePreview(e.target.result);
                reader.readAsDataURL(file);
            }
            setError('');
        }
    };

    const uploadToPinata = async (file) => {
        try {
            console.log('Starting Pinata upload...');
            
            const formData = new FormData();
            formData.append('file', file);
            
            const pinataMetadata = JSON.stringify({
                name: `Property-${Date.now()}-${file.name}`,
                keyvalues: {
                    type: 'property-image',
                    uploadedAt: new Date().toISOString()
                }
            });
            formData.append('pinataMetadata', pinataMetadata);
            
            const response = await axios.post(
                'https://api.pinata.cloud/pinning/pinFileToIPFS',
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'pinata_api_key': PINATA_API_KEY,
                        'pinata_secret_api_key': PINATA_SECRET_KEY,
                    },
                    timeout: 60000,
                }
            );
            
            if (response.data && response.data.IpfsHash) {
                const imageUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
                console.log('Image uploaded successfully:', imageUrl);
                return imageUrl;
            } else {
                throw new Error('Invalid response from Pinata');
            }
            
        } catch (err) {
            console.error('Pinata upload error:', err);
            
            if (err.response) {
                const status = err.response.status;
                const message = err.response.data?.error?.details || err.response.data?.message || 'Unknown error';
                
                if (status === 401) {
                    throw new Error('Pinata authentication failed. Please check your API keys.');
                } else if (status === 413) {
                    throw new Error('File too large. Please select a smaller image.');
                } else {
                    throw new Error(`Pinata error (${status}): ${message}`);
                }
            } else if (err.request) {
                throw new Error('Network error. Please check your internet connection.');
            } else {
                throw new Error('Failed to upload image: ' + err.message);
            }
        }
    };

    const createProperty = async () => {
        try {
            setLoading(true);
            setError('');
            setSuccess('');
            
            if (!selectedImage) {
                throw new Error('Please select an image');
            }
            
            if (!propertyForm.name.trim()) {
                throw new Error('Property name is required');
            }
            
            if (!propertyForm.propertyAddress.trim()) {
                throw new Error('Property address is required');
            }
            
            if (!propertyForm.priceInETH || parseFloat(propertyForm.priceInETH) <= 0) {
                throw new Error('Please enter a valid price greater than 0');
            }
            
            if (!contract || !account) {
                throw new Error('Please connect your wallet first');
            }

            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            setSuccess('Uploading image to IPFS...');
            
            const imageURI = await uploadToPinata(selectedImage);
            
            setSuccess('Image uploaded! Creating property NFT...');
            
            const priceInWei = ethers.parseEther(propertyForm.priceInETH.toString());
            const propertyParams = {
                name: propertyForm.name.trim(),
                description: propertyForm.description.trim() || '',
                propertyAddress: propertyForm.propertyAddress.trim(),
                ownerDetails: propertyForm.ownerDetails.trim() || '',
                imageURI: imageURI,
                priceInWei: priceInWei
            };
            
            console.log('Creating property with params:', propertyParams);
            
            try {
                const gasEstimate = await contract.mintProperty.estimateGas(propertyParams);
                const gasLimit = gasEstimate * 120n / 100n;
                
                console.log('Gas estimate:', gasEstimate.toString());
                console.log('Gas limit:', gasLimit.toString());
                
                const tx = await contract.mintProperty(propertyParams, {
                    gasLimit: gasLimit
                });
                
                setSuccess('Transaction submitted! Waiting for confirmation...');
                console.log('Transaction hash:', tx.hash);
                
                const receipt = await tx.wait();
                console.log('Transaction confirmed:', receipt);
                
                setSuccess('Property NFT created and listed successfully!');
                
                setPropertyForm({
                    name: '',
                    description: '',
                    propertyAddress: '',
                    ownerDetails: '',
                    priceInETH: ''
                });
                setSelectedImage(null);
                setImagePreview('');
                
                setTimeout(() => {
                    loadMarketplaceData();
                    loadUserProperties();
                }, 3000);
                
            } catch (gasError) {
                console.error('Gas estimation error:', gasError);
                
                if (gasError.code === 4001) {
                    throw new Error('Transaction rejected by user');
                } else if (gasError.code === 4100) {
                    throw new Error('Please reconnect your wallet and try again');
                } else if (gasError.code === -32603) {
                    throw new Error('Transaction failed. Please check your inputs and try again');
                } else {
                    throw new Error('Transaction failed: ' + gasError.message);
                }
            }
            
        } catch (err) {
            console.error('Property creation error:', err);
            setError(err.message || 'Failed to create property');
        } finally {
            setLoading(false);
        }
    };

    const listExternalNFT = async () => {
        try {
            setLoading(true);
            setError('');
            setSuccess('');
            
            // Check if listExternalNFT method exists
            if (!hasContractMethod('listExternalNFT')) {
                throw new Error('External NFT listing is not supported by this contract version');
            }
            
            if (!externalImage) {
                throw new Error('Please select an image');
            }
            
            if (!externalNFTForm.nftContract.trim()) {
                throw new Error('NFT contract address is required');
            }
            
            if (!ethers.isAddress(externalNFTForm.nftContract)) {
                throw new Error('Invalid NFT contract address');
            }
            
            if (!externalNFTForm.tokenId) {
                throw new Error('Token ID is required');
            }
            
            if (!externalNFTForm.name.trim()) {
                throw new Error('NFT name is required');
            }
            
            if (!externalNFTForm.priceInETH || parseFloat(externalNFTForm.priceInETH) <= 0) {
                throw new Error('Please enter a valid price greater than 0');
            }
            
            if (!contract || !account) {
                throw new Error('Please connect your wallet first');
            }

            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            setSuccess('Uploading image to IPFS...');
            
            const imageURI = await uploadToPinata(externalImage);
            
            setSuccess('Image uploaded! Listing external NFT...');
            
            const priceInWei = ethers.parseEther(externalNFTForm.priceInETH.toString());
            const externalParams = {
                nftContract: externalNFTForm.nftContract.trim(),
                tokenId: parseInt(externalNFTForm.tokenId),
                name: externalNFTForm.name.trim(),
                description: externalNFTForm.description.trim() || '',
                propertyAddress: externalNFTForm.propertyAddress.trim() || '',
                ownerDetails: externalNFTForm.ownerDetails.trim() || '',
                imageURI: imageURI,
                priceInWei: priceInWei
            };
            
            console.log('Listing external NFT with params:', externalParams);
            
            try {
                const gasEstimate = await contract.listExternalNFT.estimateGas(externalParams);
                const gasLimit = gasEstimate * 120n / 100n;
                
                const tx = await contract.listExternalNFT(externalParams, {
                    gasLimit: gasLimit
                });
                
                setSuccess('Transaction submitted! Waiting for confirmation...');
                console.log('Transaction hash:', tx.hash);
                
                const receipt = await tx.wait();
                console.log('Transaction confirmed:', receipt);
                
                setSuccess('External NFT listed successfully!');
                
                setExternalNFTForm({
                    nftContract: '',
                    tokenId: '',
                    name: '',
                    description: '',
                    propertyAddress: '',
                    ownerDetails: '',
                    priceInETH: ''
                });
                setExternalImage(null);
                setExternalImagePreview('');
                
                setTimeout(() => {
                    loadMarketplaceData();
                    loadUserExternalListings();
                }, 3000);
                
            } catch (gasError) {
                console.error('Gas estimation error:', gasError);
                
                if (gasError.code === 4001) {
                    throw new Error('Transaction rejected by user');
                } else if (gasError.code === 4100) {
                    throw new Error('Please reconnect your wallet and try again');
                } else {
                    throw new Error('Transaction failed: ' + gasError.message);
                }
            }
            
        } catch (err) {
            console.error('External NFT listing error:', err);
            setError(err.message || 'Failed to list external NFT');
        } finally {
            setLoading(false);
        }
    };

    const purchaseProperty = async (tokenId, priceInWei) => {
        try {
            setLoading(true);
            setError('');
            setSuccess('');
            
            if (!contract || !account) {
                throw new Error('Please connect your wallet first');
            }

            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            console.log('Purchasing property:', { tokenId, priceInWei });
            
            try {
                const gasEstimate = await contract.purchaseProperty.estimateGas(tokenId, {
                    value: priceInWei
                });
                const gasLimit = gasEstimate * 120n / 100n;
                
                const tx = await contract.purchaseProperty(tokenId, {
                    value: priceInWei,
                    gasLimit: gasLimit
                });
                
                setSuccess('Purchase transaction submitted! Waiting for confirmation...');
                const receipt = await tx.wait();
                setSuccess('Property purchased successfully!');
                
                setTimeout(() => {
                    loadMarketplaceData();
                    loadUserProperties();
                    loadContractBalance();
                }, 3000);
                
            } catch (gasError) {
                console.error('Purchase gas error:', gasError);
                
                if (gasError.code === 4001) {
                    throw new Error('Transaction rejected by user');
                } else if (gasError.code === 4100) {
                    throw new Error('Please reconnect your wallet and try again');
                } else {
                    throw new Error('Purchase failed: ' + gasError.message);
                }
            }
            
        } catch (err) {
            console.error('Purchase error:', err);
            setError(err.message || 'Purchase failed');
        } finally {
            setLoading(false);
        }
    };

    const purchaseExternalNFT = async (listingId, priceInWei) => {
        try {
            setLoading(true);
            setError('');
            setSuccess('');
            
            if (!hasContractMethod('purchaseExternalNFT')) {
                throw new Error('External NFT purchasing is not supported by this contract version');
            }
            
            if (!contract || !account) {
                throw new Error('Please connect your wallet first');
            }

            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            console.log('Purchasing external NFT:', { listingId, priceInWei });
            
            try {
                const gasEstimate = await contract.purchaseExternalNFT.estimateGas(listingId, {
                    value: priceInWei
                });
                const gasLimit = gasEstimate * 120n / 100n;
                
                const tx = await contract.purchaseExternalNFT(listingId, {
                    value: priceInWei,
                    gasLimit: gasLimit
                });
                
                setSuccess('Purchase transaction submitted! Waiting for confirmation...');
                const receipt = await tx.wait();
                setSuccess('External NFT purchased successfully!');
                
                setTimeout(() => {
                    loadMarketplaceData();
                    loadUserExternalListings();
                    loadContractBalance();
                }, 3000);
                
            } catch (gasError) {
                console.error('External NFT purchase gas error:', gasError);
                
                if (gasError.code === 4001) {
                    throw new Error('Transaction rejected by user');
                } else if (gasError.code === 4100) {
                    throw new Error('Please reconnect your wallet and try again');
                } else {
                    throw new Error('Purchase failed: ' + gasError.message);
                }
            }
            
        } catch (err) {
            console.error('External NFT purchase error:', err);
            setError(err.message || 'Purchase failed');
        } finally {
            setLoading(false);
        }
    };

    // NEW: Withdraw fees function for owner
    const withdrawFees = async () => {
        try {
            setLoading(true);
            setError('');
            setSuccess('');
            
            if (!contract || !account) {
                throw new Error('Please connect your wallet first');
            }

            if (!isOwner()) {
                throw new Error('Only the contract owner can withdraw fees');
            }

            if (!hasContractMethod('withdrawFees')) {
                throw new Error('Withdraw fees function is not available in this contract');
            }

            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            console.log('Withdrawing fees...');
            
            try {
                const gasEstimate = await contract.withdrawFees.estimateGas();
                const gasLimit = gasEstimate * 120n / 100n;
                
                const tx = await contract.withdrawFees({
                    gasLimit: gasLimit
                });
                
                setSuccess('Withdraw transaction submitted! Waiting for confirmation...');
                const receipt = await tx.wait();
                setSuccess('Fees withdrawn successfully!');
                
                setTimeout(() => {
                    loadContractBalance();
                }, 3000);
                
            } catch (gasError) {
                console.error('Withdraw gas error:', gasError);
                
                if (gasError.code === 4001) {
                    throw new Error('Transaction rejected by user');
                } else if (gasError.code === 4100) {
                    throw new Error('Please reconnect your wallet and try again');
                } else {
                    throw new Error('Withdraw failed: ' + gasError.message);
                }
            }
            
        } catch (err) {
            console.error('Withdraw error:', err);
            setError(err.message || 'Withdraw failed');
        } finally {
            setLoading(false);
        }
    };

    // NEW: Load contract balance
    const loadContractBalance = async () => {
        try {
            if (!provider) return;
            
            const balance = await provider.getBalance(CONTRACT_ADDRESS);
            setContractBalance(ethers.formatEther(balance));
            console.log('Contract balance:', ethers.formatEther(balance), 'ETH');
            
        } catch (err) {
            console.error('Failed to load contract balance:', err);
        }
    };

    // Fixed loadMarketplaceData with better error handling and fallback mechanisms
    const loadMarketplaceData = async () => {
        try {
            if (!contract) return;
            
            console.log('Loading marketplace data...');
            
            // Load internal properties
            const internalProperties = [];
            
            try {
                if (hasContractMethod('getListedProperties')) {
                    const listedTokenIds = await contract.getListedProperties();
                    console.log('Listed token IDs:', listedTokenIds);
                    
                    for (let tokenId of listedTokenIds) {
                        try {
                            const tokenIdNum = Number(tokenId);
                            if (tokenIdNum <= 0) {
                                console.warn(`Invalid token ID: ${tokenId}`);
                                continue;
                            }
                            
                            // Check if property exists
                            const propertyExists = hasContractMethod('propertyExists') ? 
                                await contract.propertyExists(tokenId) : true;
                            console.log(`Property ${tokenId} exists:`, propertyExists);
                            
                            if (propertyExists) {
                                try {
                                    // Try to get property with USD price first
                                    if (hasContractMethod('getPropertyWithUSDPrice')) {
                                        const [propertyWithDetails, priceInUSD] = await contract.getPropertyWithUSDPrice(tokenId);
                                        console.log(`Property ${tokenId} details:`, propertyWithDetails);
                                        console.log(`Property ${tokenId} USD price:`, priceInUSD.toString());
                                        
                                        if (propertyWithDetails.exists && propertyWithDetails.isListed && !propertyWithDetails.isSold) {
                                            internalProperties.push({
                                                ...propertyWithDetails,
                                                priceInUSD: priceInUSD.toString(),
                                                isInternal: true,
                                                tokenId: tokenId.toString(),
                                                priceInWei: propertyWithDetails.priceInWei.toString(),
                                                owner: propertyWithDetails.owner,
                                                imageURI: getWorkingImageUrl(propertyWithDetails.imageURI)
                                            });
                                        }
                                    } else {
                                        // Fallback to basic property getter
                                        const property = await contract.properties(tokenId);
                                        if (property.exists && property.isListed && !property.isSold) {
                                            internalProperties.push({
                                                ...property,
                                                priceInUSD: '0',
                                                isInternal: true,
                                                tokenId: tokenId.toString(),
                                                priceInWei: property.priceInWei.toString(),
                                                owner: property.owner,
                                                imageURI: getWorkingImageUrl(property.imageURI)
                                            });
                                        }
                                    }
                                } catch (priceError) {
                                    console.error(`Error getting price for property ${tokenId}:`, priceError);
                                    try {
                                        const property = await contract.properties(tokenId);
                                        if (property.exists && property.isListed && !property.isSold) {
                                            internalProperties.push({
                                                ...property,
                                                priceInUSD: '0',
                                                isInternal: true,
                                                tokenId: tokenId.toString(),
                                                priceInWei: property.priceInWei.toString(),
                                                owner: property.owner,
                                                imageURI: getWorkingImageUrl(property.imageURI)
                                            });
                                        }
                                    } catch (fallbackError) {
                                        console.error(`Fallback failed for property ${tokenId}:`, fallbackError);
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Error loading property ${tokenId}:`, err);
                        }
                    }
                } else {
                    console.warn('getListedProperties method not available in contract');
                }
            } catch (err) {
                console.error('Error loading internal properties:', err);
            }
            
            // Load external listings (with fallback) - FIXED: Skip if method doesn't exist
            const externalListings = [];
            
            try {
                if (hasContractMethod('getActiveExternalListings')) {
                    const externalListingIds = await contract.getActiveExternalListings();
                    console.log('External listing IDs:', externalListingIds);
                    
                    for (let listingId of externalListingIds) {
                        try {
                            const listingIdNum = Number(listingId);
                            if (listingIdNum <= 0) {
                                console.warn(`Invalid listing ID: ${listingId}`);
                                continue;
                            }
                            
                            const listingExists = hasContractMethod('externalListingExists') ? 
                                await contract.externalListingExists(listingId) : true;
                            console.log(`External listing ${listingId} exists:`, listingExists);
                            
                            if (listingExists) {
                                try {
                                    if (hasContractMethod('getExternalListingWithUSDPrice')) {
                                        const [listingWithDetails, priceInUSD] = await contract.getExternalListingWithUSDPrice(listingId);
                                        console.log(`External listing ${listingId} details:`, listingWithDetails);
                                        console.log(`External listing ${listingId} USD price:`, priceInUSD.toString());
                                        
                                        if (listingWithDetails.exists && listingWithDetails.isActive && !listingWithDetails.isSold) {
                                            externalListings.push({
                                                ...listingWithDetails,
                                                priceInUSD: priceInUSD.toString(),
                                                isInternal: false,
                                                listingId: listingId.toString(),
                                                priceInWei: listingWithDetails.priceInWei.toString(),
                                                owner: listingWithDetails.owner,
                                                imageURI: getWorkingImageUrl(listingWithDetails.imageURI)
                                            });
                                        }
                                    } else {
                                        const listing = await contract.externalListings(listingId);
                                        if (listing.exists && listing.isActive && !listing.isSold) {
                                            externalListings.push({
                                                ...listing,
                                                priceInUSD: '0',
                                                isInternal: false,
                                                listingId: listingId.toString(),
                                                priceInWei: listing.priceInWei.toString(),
                                                owner: listing.owner,
                                                imageURI: getWorkingImageUrl(listing.imageURI)
                                            });
                                        }
                                    }
                                } catch (priceError) {
                                    console.error(`Error getting price for listing ${listingId}:`, priceError);
                                    try {
                                        const listing = await contract.externalListings(listingId);
                                        if (listing.exists && listing.isActive && !listing.isSold) {
                                            externalListings.push({
                                                ...listing,
                                                priceInUSD: '0',
                                                isInternal: false,
                                                listingId: listingId.toString(),
                                                priceInWei: listing.priceInWei.toString(),
                                                owner: listing.owner,
                                                imageURI: getWorkingImageUrl(listing.imageURI)
                                            });
                                        }
                                    } catch (fallbackError) {
                                        console.error(`Fallback failed for listing ${listingId}:`, fallbackError);
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Error loading external listing ${listingId}:`, err);
                        }
                    }
                } else {
                    console.warn('getActiveExternalListings method not available in contract - skipping external listings');
                }
            } catch (err) {
                console.error('Error loading external listings:', err);
                // Don't throw error here, just log it
            }
            
            const allProperties = [...internalProperties, ...externalListings];
            setListedProperties(allProperties);
            console.log('Loaded properties:', allProperties);
            
        } catch (err) {
            console.error('Failed to load marketplace data:', err);
            // Don't set error state here to avoid blocking the UI
            console.warn('Marketplace data loading failed, but continuing...');
        }
    };

    // Enhanced loadUserProperties with better error handling and USD price formatting
    const loadUserProperties = async () => {
        try {
            if (!contract || !account) return;
            
            console.log('Loading user properties for:', account);
            
            const properties = [];
            
            try {
                if (hasContractMethod('getUserProperties')) {
                    const userTokenIds = await contract.getUserProperties(account);
                    console.log('User token IDs:', userTokenIds);
                    
                    for (let tokenId of userTokenIds) {
                        try {
                            const tokenIdNum = Number(tokenId);
                            if (tokenIdNum <= 0) {
                                console.warn(`Invalid user token ID: ${tokenId}`);
                                continue;
                            }
                            
                            const propertyExists = hasContractMethod('propertyExists') ? 
                                await contract.propertyExists(tokenId) : true;
                            console.log(`User property ${tokenId} exists:`, propertyExists);
                            
                            if (propertyExists) {
                                try {
                                    if (hasContractMethod('getPropertyWithUSDPrice')) {
                                        const [propertyWithDetails, priceInUSD] = await contract.getPropertyWithUSDPrice(tokenId);
                                        console.log(`User property ${tokenId} details:`, propertyWithDetails);
                                        console.log(`User property ${tokenId} USD price:`, priceInUSD.toString());
                                        
                                        if (propertyWithDetails.exists) {
                                            properties.push({
                                                ...propertyWithDetails,
                                                priceInUSD: priceInUSD.toString(),
                                                tokenId: tokenId.toString(),
                                                priceInWei: propertyWithDetails.priceInWei.toString(),
                                                imageURI: getWorkingImageUrl(propertyWithDetails.imageURI)
                                            });
                                        }
                                    } else {
                                        const property = await contract.properties(tokenId);
                                        if (property.exists) {
                                            properties.push({
                                                ...property,
                                                priceInUSD: '0',
                                                tokenId: tokenId.toString(),
                                                priceInWei: property.priceInWei.toString(),
                                                imageURI: getWorkingImageUrl(property.imageURI)
                                            });
                                        }
                                    }
                                } catch (priceError) {
                                    console.error(`Error getting price for user property ${tokenId}:`, priceError);
                                    try {
                                        const property = await contract.properties(tokenId);
                                        if (property.exists) {
                                            properties.push({
                                                ...property,
                                                priceInUSD: '0',
                                                tokenId: tokenId.toString(),
                                                priceInWei: property.priceInWei.toString(),
                                                imageURI: getWorkingImageUrl(property.imageURI)
                                            });
                                        }
                                    } catch (fallbackError) {
                                        console.error(`Fallback failed for user property ${tokenId}:`, fallbackError);
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Error loading user property ${tokenId}:`, err);
                        }
                    }
                } else {
                    console.warn('getUserProperties method not available in contract');
                }
            } catch (err) {
                console.error('Error loading user properties:', err);
            }
            
            setUserProperties(properties);
            console.log('Loaded user properties:', properties);
            
        } catch (err) {
            console.error('Failed to load user properties:', err);
            // Don't set error state to avoid blocking UI
        }
    };

    // Enhanced loadUserExternalListings with better error handling and USD price formatting
    const loadUserExternalListings = async () => {
        try {
            if (!contract || !account) return;
            
            console.log('Loading user external listings for:', account);
            
            const listings = [];
            
            try {
                if (hasContractMethod('getUserExternalListings')) {
                    const userListingIds = await contract.getUserExternalListings(account);
                    console.log('User external listing IDs:', userListingIds);
                    
                    for (let listingId of userListingIds) {
                        try {
                            const listingIdNum = Number(listingId);
                            if (listingIdNum <= 0) {
                                console.warn(`Invalid user listing ID: ${listingId}`);
                                continue;
                            }
                            
                            const listingExists = hasContractMethod('externalListingExists') ? 
                                await contract.externalListingExists(listingId) : true;
                            console.log(`User external listing ${listingId} exists:`, listingExists);
                            
                            if (listingExists) {
                                try {
                                    if (hasContractMethod('getExternalListingWithUSDPrice')) {
                                        const [listingWithDetails, priceInUSD] = await contract.getExternalListingWithUSDPrice(listingId);
                                        console.log(`User external listing ${listingId} details:`, listingWithDetails);
                                        console.log(`User external listing ${listingId} USD price:`, priceInUSD.toString());
                                        
                                        if (listingWithDetails.exists) {
                                            listings.push({
                                                ...listingWithDetails,
                                                priceInUSD: priceInUSD.toString(),
                                                listingId: listingId.toString(),
                                                priceInWei: listingWithDetails.priceInWei.toString(),
                                                imageURI: getWorkingImageUrl(listingWithDetails.imageURI)
                                            });
                                        }
                                    } else {
                                        const listing = await contract.externalListings(listingId);
                                        if (listing.exists) {
                                            listings.push({
                                                ...listing,
                                                priceInUSD: '0',
                                                listingId: listingId.toString(),
                                                priceInWei: listing.priceInWei.toString(),
                                                imageURI: getWorkingImageUrl(listing.imageURI)
                                            });
                                        }
                                    }
                                } catch (priceError) {
                                    console.error(`Error getting price for user listing ${listingId}:`, priceError);
                                    try {
                                        const listing = await contract.externalListings(listingId);
                                        if (listing.exists) {
                                            listings.push({
                                                ...listing,
                                                priceInUSD: '0',
                                                listingId: listingId.toString(),
                                                priceInWei: listing.priceInWei.toString(),
                                                imageURI: getWorkingImageUrl(listing.imageURI)
                                            });
                                        }
                                    } catch (fallbackError) {
                                        console.error(`Fallback failed for user listing ${listingId}:`, fallbackError);
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Error loading user external listing ${listingId}:`, err);
                        }
                    }
                } else {
                    console.warn('getUserExternalListings method not available in contract');
                }
            } catch (err) {
                console.error('Error loading user external listings:', err);
            }
            
            setUserExternalListings(listings);
            console.log('Loaded user external listings:', listings);
            
        } catch (err) {
            console.error('Failed to load user external listings:', err);
            // Don't set error state to avoid blocking UI
        }
    };

    const refreshData = async () => {
        if (contract && account) {
            setLoading(true);
            try {
                await Promise.all([
                    loadMarketplaceData(),
                    loadUserProperties(),
                    loadUserExternalListings(),
                    loadContractBalance()
                ]);
                setSuccess('Data refreshed successfully!');
            } catch (err) {
                console.error('Failed to refresh data:', err);
                // Don't show error for refresh failures
            } finally {
                setLoading(false);
            }
        }
    };

    const closeMessage = () => {
        setError('');
        setSuccess('');
    };

    const formatAddress = (address) => {
        if (!address) return '';
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };

    const formatPrice = (priceInWei) => {
        try {
            return ethers.formatEther(priceInWei);
        } catch {
            return '0';
        }
    };

    return (
        <div className="app-container">
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    <h1 className="header-title">PropertyNFT Marketplace</h1>
                    <div className="header-info">
                        <div className="contract-info">
                            Contract: {formatAddress(CONTRACT_ADDRESS)}
                            {isOwner() && (
                                <span className="owner-badge">OWNER</span>
                            )}
                        </div>
                        {!account ? (
                            <button 
                                className="connect-btn" 
                                onClick={connectWallet}
                                disabled={isConnecting}
                            >
                                {isConnecting ? (
                                    <>
                                        <span className="loading-spinner"></span>
                                        Connecting...
                                    </>
                                ) : (
                                    'Connect Wallet'
                                )}
                            </button>
                        ) : (
                            <div className="account-info">
                                <span>Connected: {formatAddress(account)}</span>
                                <button className="disconnect-btn" onClick={disconnectWallet}>
                                    Disconnect
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Error/Success Messages */}
            {error && (
                <div className="error-message">
                    <span>{error}</span>
                    <button className="close-btn" onClick={closeMessage}>×</button>
                </div>
            )}

            {success && (
                <div className="success-message">
                    <span>{success}</span>
                    <button className="close-btn" onClick={closeMessage}>×</button>
                </div>
            )}

            {/* Tab Navigation */}
            {account && (
                <div className="tab-navigation">
                    <button 
                        className={activeTab === 'marketplace' ? 'active' : ''}
                        onClick={() => setActiveTab('marketplace')}
                    >
                        Marketplace
                    </button>
                    <button 
                        className={activeTab === 'create' ? 'active' : ''}
                        onClick={() => setActiveTab('create')}
                    >
                        Create Property
                    </button>
                    {hasContractMethod('listExternalNFT') && (
                        <button 
                            className={activeTab === 'list-external' ? 'active' : ''}
                            onClick={() => setActiveTab('list-external')}
                        >
                            List External NFT
                        </button>
                    )}
                    <button 
                        className={activeTab === 'my-properties' ? 'active' : ''}
                        onClick={() => setActiveTab('my-properties')}
                    >
                        My Properties
                    </button>
                    {hasContractMethod('getUserExternalListings') && (
                        <button 
                            className={activeTab === 'my-listings' ? 'active' : ''}
                            onClick={() => setActiveTab('my-listings')}
                        >
                            My External Listings
                        </button>
                    )}
                    {isOwner() && (
                        <button 
                            className={activeTab === 'admin' ? 'active' : ''}
                            onClick={() => setActiveTab('admin')}
                        >
                            Admin Panel
                        </button>
                    )}
                </div>
            )}

            {/* Main Content */}
            {!account ? (
                <div className="empty-state">
                    <div className="empty-icon">🏠</div>
                    <h3>Welcome to PropertyNFT Marketplace</h3>
                    <p>Connect your wallet to start buying, selling, and creating property NFTs</p>
                    <button className="create-first-btn" onClick={connectWallet}>
                        Connect Wallet to Get Started
                    </button>
                </div>
            ) : (
                <>
                    {/* Marketplace Tab */}
                    {activeTab === 'marketplace' && (
                        <div className="marketplace-section">
                            <div className="section-header">
                                <h2>Property Marketplace</h2>
                                <button 
                                    className="refresh-btn" 
                                    onClick={refreshData}
                                    disabled={loading}
                                >
                                    {loading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>

                            {listedProperties.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">🏘️</div>
                                    <h3>No Properties Listed</h3>
                                    <p>Be the first to list a property on the marketplace!</p>
                                    <button 
                                        className="create-first-btn" 
                                        onClick={() => setActiveTab('create')}
                                    >
                                        Create First Property
                                    </button>
                                </div>
                            ) : (
                                <div className="properties-grid">
                                    {listedProperties.map((property, index) => (
                                        <div key={index} className="property-card">
                                            <div className="property-image-container">
                                                <img 
                                                    src={property.imageURI} 
                                                    alt={property.name}
                                                    className="property-image"
                                                    onError={(e) => {
                                                        console.log('Image failed to load:', property.imageURI);
                                                        e.target.src = 'https://via.placeholder.com/400x250?text=Property+Image';
                                                    }}
                                                    onLoad={() => {
                                                        console.log('Image loaded successfully:', property.imageURI);
                                                    }}
                                                />
                                                <div className="property-type-badge">
                                                    <span className={`type-badge ${property.isInternal ? 'internal' : 'external'}`}>
                                                        {property.isInternal ? 'Internal NFT' : 'External NFT'}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="property-details">
                                                <h3>{property.name}</h3>
                                                {property.propertyAddress && (
                                                    <p className="property-address">📍 {property.propertyAddress}</p>
                                                )}
                                                {property.description && (
                                                    <p className="property-description">{property.description}</p>
                                                )}
                                                
                                                <div className="property-price">
                                                    <div className="price-eth">
                                                        {formatPrice(property.priceInWei)} ETH
                                                    </div>
                                                    <div className="price-usd">
                                                        {formatUSDPrice(property.priceInUSD)}
                                                    </div>
                                                </div>
                                                
                                                <p className="owner">
                                                    Owner: {formatAddress(property.owner)}
                                                </p>
                                                
                                                <div className="property-status">
                                                    <span className="status listed">Listed</span>
                                                    {property.isInternal && (
                                                        <span className="token-id">
                                                            Token #{property.tokenId}
                                                        </span>
                                                    )}
                                                    {!property.isInternal && (
                                                        <span className="token-id">
                                                            Listing #{property.listingId}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {property.owner.toLowerCase() === account.toLowerCase() ? (
                                                    <div className="owner-badge">
                                                        You own this property
                                                    </div>
                                                ) : (
                                                    <button 
                                                        className="purchase-btn"
                                                        onClick={() => {
                                                            if (property.isInternal) {
                                                                purchaseProperty(property.tokenId, property.priceInWei);
                                                            } else {
                                                                purchaseExternalNFT(property.listingId, property.priceInWei);
                                                            }
                                                        }}
                                                        disabled={loading}
                                                    >
                                                        {loading ? 'Processing...' : 'Buy Now'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Create Property Tab */}
                    {activeTab === 'create' && (
                        <div className="create-section">
                            <div className="section-header">
                                <h2>Create Property NFT</h2>
                            </div>

                            <div className="create-form">
                                <div className="form-group">
                                    <label>Property Name *</label>
                                    <input
                                        type="text"
                                        className="text-input"
                                        placeholder="Enter property name"
                                        value={propertyForm.name}
                                        onChange={(e) => setPropertyForm({...propertyForm, name: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Property Address *</label>
                                    <input
                                        type="text"
                                        className="text-input"
                                        placeholder="Enter property address"
                                        value={propertyForm.propertyAddress}
                                        onChange={(e) => setPropertyForm({...propertyForm, propertyAddress: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        className="textarea-input"
                                        placeholder="Enter property description"
                                        value={propertyForm.description}
                                        onChange={(e) => setPropertyForm({...propertyForm, description: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Owner Details</label>
                                    <input
                                        type="text"
                                        className="text-input"
                                        placeholder="Enter owner details"
                                        value={propertyForm.ownerDetails}
                                        onChange={(e) => setPropertyForm({...propertyForm, ownerDetails: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Price in ETH *</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        className="text-input"
                                        placeholder="Enter price in ETH"
                                        value={propertyForm.priceInETH}
                                        onChange={(e) => setPropertyForm({...propertyForm, priceInETH: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Property Image *</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="file-input"
                                        onChange={(e) => handleImageUpload(e, false)}
                                    />
                                    {imagePreview && (
                                        <div className="image-preview-container">
                                            <img src={imagePreview} alt="Preview" className="image-preview" />
                                        </div>
                                    )}
                                </div>

                                <button 
                                    className="create-btn"
                                    onClick={createProperty}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <span className="loading-spinner"></span>
                                            Creating...
                                        </>
                                    ) : (
                                        'Create Property NFT'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* List External NFT Tab - Only show if supported */}
                    {activeTab === 'list-external' && hasContractMethod('listExternalNFT') && (
                        <div className="create-section">
                            <div className="section-header">
                                <h2>List External NFT</h2>
                            </div>

                            <div className="create-form">
                                <div className="form-group">
                                    <label>NFT Contract Address *</label>
                                    <input
                                        type="text"
                                        className="text-input"
                                        placeholder="Enter NFT contract address"
                                        value={externalNFTForm.nftContract}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, nftContract: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Token ID *</label>
                                    <input
                                        type="number"
                                        className="text-input"
                                        placeholder="Enter token ID"
                                        value={externalNFTForm.tokenId}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, tokenId: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>NFT Name *</label>
                                    <input
                                        type="text"
                                        className="text-input"
                                        placeholder="Enter NFT name"
                                        value={externalNFTForm.name}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, name: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Property Address</label>
                                    <input
                                        type="text"
                                        className="text-input"
                                        placeholder="Enter property address (if applicable)"
                                        value={externalNFTForm.propertyAddress}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, propertyAddress: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        className="textarea-input"
                                        placeholder="Enter NFT description"
                                        value={externalNFTForm.description}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, description: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Owner Details</label>
                                    <input
                                        type="text"
                                        className="text-input"
                                        placeholder="Enter owner details"
                                        value={externalNFTForm.ownerDetails}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, ownerDetails: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Price in ETH *</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        className="text-input"
                                        placeholder="Enter price in ETH"
                                        value={externalNFTForm.priceInETH}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, priceInETH: e.target.value})}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>NFT Image *</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="file-input"
                                        onChange={(e) => handleImageUpload(e, true)}
                                    />
                                    {externalImagePreview && (
                                        <div className="image-preview-container">
                                            <img src={externalImagePreview} alt="Preview" className="image-preview" />
                                        </div>
                                    )}
                                </div>

                                <button 
                                    className="create-btn"
                                    onClick={listExternalNFT}
                                    disabled={loading}
                                >
                                    </button>
                                    
                                
                            </div>
                        </div>
                    )}

                    {/* My Properties Tab */}
                    {activeTab === 'my-properties' && (
                        <div className="my-properties-section">
                            <div className="section-header">
                                <h2>My Properties</h2>
                                <button 
                                    className="refresh-btn" 
                                    onClick={refreshData}
                                    disabled={loading}
                                >
                                    {loading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>

                            {userProperties.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">🏠</div>
                                    <h3>No Properties Owned</h3>
                                    <p>You don't own any properties yet. Create or buy some to see them here!</p>
                                    <button 
                                        className="create-first-btn" 
                                        onClick={() => setActiveTab('create')}
                                    >
                                        Create Your First Property
                                    </button>
                                </div>
                            ) : (
                                <div className="properties-grid">
                                    {userProperties.map((property, index) => (
                                        <div key={index} className="property-card">
                                            <div className="property-image-container">
                                                <img 
                                                    src={property.imageURI} 
                                                    alt={property.name}
                                                    className="property-image"
                                                    onError={(e) => {
                                                        console.log('User property image failed to load:', property.imageURI);
                                                        e.target.src = 'https://via.placeholder.com/400x250?text=Property+Image';
                                                    }}
                                                    onLoad={() => {
                                                        console.log('User property image loaded successfully:', property.imageURI);
                                                    }}
                                                />
                                                <div className="property-type-badge">
                                                    <span className="type-badge internal">
                                                        My Property
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="property-details">
                                                <h3>{property.name}</h3>
                                                {property.propertyAddress && (
                                                    <p className="property-address">📍 {property.propertyAddress}</p>
                                                )}
                                                {property.description && (
                                                    <p className="property-description">{property.description}</p>
                                                )}
                                                
                                                <div className="property-price">
                                                    <div className="price-eth">
                                                        {formatPrice(property.priceInWei)} ETH
                                                    </div>
                                                    <div className="price-usd">
                                                        {formatUSDPrice(property.priceInUSD)}
                                                    </div>
                                                </div>
                                                
                                                <div className="property-status">
                                                    <span className={`status ${property.isListed ? 'listed' : 'unlisted'}`}>
                                                        {property.isSold ? 'Sold' : property.isListed ? 'Listed' : 'Not Listed'}
                                                    </span>
                                                    <span className="token-id">
                                                        Token #{property.tokenId}
                                                    </span>
                                                </div>
                                                
                                                <div className="owner-badge">
                                                    You own this property
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* My External Listings Tab - Only show if supported */}
                    {activeTab === 'my-listings' && hasContractMethod('getUserExternalListings') && (
                        <div className="my-properties-section">
                            <div className="section-header">
                                <h2>My External Listings</h2>
                                <button 
                                    className="refresh-btn" 
                                    onClick={refreshData}
                                    disabled={loading}
                                >
                                    {loading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>

                            {userExternalListings.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">🎨</div>
                                    <h3>No External Listings</h3>
                                    <p>You haven't listed any external NFTs yet. List some to see them here!</p>
                                    {hasContractMethod('listExternalNFT') && (
                                        <button 
                                            className="create-first-btn" 
                                            onClick={() => setActiveTab('list-external')}
                                        >
                                            List Your First External NFT
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="properties-grid">
                                    {userExternalListings.map((listing, index) => (
                                        <div key={index} className="property-card">
                                            <div className="property-image-container">
                                                <img 
                                                    src={listing.imageURI} 
                                                    alt={listing.name}
                                                    className="property-image"
                                                    onError={(e) => {
                                                        console.log('External listing image failed to load:', listing.imageURI);
                                                        e.target.src = 'https://via.placeholder.com/400x250?text=NFT+Image';
                                                    }}
                                                    onLoad={() => {
                                                        console.log('External listing image loaded successfully:', listing.imageURI);
                                                    }}
                                                />
                                                <div className="property-type-badge">
                                                    <span className="type-badge external">
                                                        External NFT
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="property-details">
                                                <h3>{listing.name}</h3>
                                                {listing.propertyAddress && (
                                                    <p className="property-address">📍 {listing.propertyAddress}</p>
                                                )}
                                                {listing.description && (
                                                    <p className="property-description">{listing.description}</p>
                                                )}
                                                
                                                <div className="property-price">
                                                    <div className="price-eth">
                                                        {formatPrice(listing.priceInWei)} ETH
                                                    </div>
                                                    <div className="price-usd">
                                                        {formatUSDPrice(listing.priceInUSD)}
                                                    </div>
                                                </div>
                                                
                                                <p className="owner">
                                                    Contract: {formatAddress(listing.nftContract)}
                                                </p>
                                                
                                                <div className="property-status">
                                                    <span className={`status ${listing.isActive ? 'listed' : 'unlisted'}`}>
                                                        {listing.isSold ? 'Sold' : listing.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                    <span className="token-id">
                                                        Listing #{listing.listingId}
                                                    </span>
                                                </div>
                                                
                                                <div className="owner-badge">
                                                    Your listing
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Admin Panel Tab - Only for owner */}
                    {activeTab === 'admin' && isOwner() && (
                        <div className="admin-section">
                            <div className="section-header">
                                <h2>Admin Panel</h2>
                                <span className="owner-badge">Contract Owner</span>
                            </div>

                            <div className="admin-grid">
                                <div className="admin-card">
                                    <h3>Contract Balance</h3>
                                    <div className="balance-display">
                                        <span className="balance-amount">{contractBalance} ETH</span>
                                        <span className="balance-label">Available Fees</span>
                                    </div>
                                    <button 
                                        className="admin-btn withdraw-btn"
                                        onClick={withdrawFees}
                                        disabled={loading || parseFloat(contractBalance) === 0}
                                    >
                                        {loading ? (
                                            <>
                                                <span className="loading-spinner"></span>
                                                Withdrawing...
                                            </>
                                        ) : (
                                            'Withdraw Fees'
                                        )}
                                    </button>
                                </div>

                                <div className="admin-card">
                                    <h3>Marketplace Statistics</h3>
                                    <div className="stats-grid">
                                        <div className="stat-item">
                                            <span className="stat-value">{listedProperties.length}</span>
                                            <span className="stat-label">Listed Properties</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-value">{userProperties.length}</span>
                                            <span className="stat-label">Your Properties</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-value">{userExternalListings.length}</span>
                                            <span className="stat-label">External Listings</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="admin-card">
                                    <h3>Contract Information</h3>
                                    <div className="contract-details">
                                        <div className="detail-item">
                                            <span className="detail-label">Contract Address:</span>
                                            <span className="detail-value">{CONTRACT_ADDRESS}</span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Owner Address:</span>
                                            <span className="detail-value">{OWNER_ADDRESS}</span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Network:</span>
                                            <span className="detail-value">Ethereum Sepolia Testnet</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Loading Overlay */}
            {loading && (
                <div className="loading-overlay">
                    <div className="loading-spinner-large"></div>
                    <p>Processing transaction...</p>
                </div>
            )}
        </div>
    );
};

export default PropertyNFTMarketplace;
          