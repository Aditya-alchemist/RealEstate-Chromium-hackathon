import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import contractABI from './abi.json';
import './App.css';

// Pinata configuration
const PINATA_API_KEY = '223553f88ea60420fae4';
const PINATA_SECRET_KEY = '36b531be959f28db2b3a9b8672fe4243dd82ccf518624ebbffd1b5b1280ec78d';

// Your deployed contract address
const CONTRACT_ADDRESS = '0x168725dc58f2F08257074D55735378C8Ba8b9D9b';

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

    // Initialize Web3 connection
    useEffect(() => {
        initializeWeb3();
        
        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
            window.ethereum.on('disconnect', handleDisconnect);
        }

        // Cleanup listeners
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
        }
    }, [contract, account]);

    const initializeWeb3 = async () => {
        try {
            if (window.ethereum) {
                const web3Provider = new ethers.BrowserProvider(window.ethereum);
                setProvider(web3Provider);
                
                // Check if already connected
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
            // User disconnected
            setAccount('');
            setContract(null);
            setSigner(null);
            setListedProperties([]);
            setUserProperties([]);
            setUserExternalListings([]);
        } else if (accounts[0] !== account) {
            // User switched accounts
            await connectWallet();
        }
    };

    const handleChainChanged = (chainId) => {
        // Reload the page when chain changes
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

            // Request account access - this is CRITICAL for authorization
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
            
            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found. Please unlock MetaMask and try again.');
            }
            
            // Create provider and signer
            const web3Provider = new ethers.BrowserProvider(window.ethereum);
            const web3Signer = await web3Provider.getSigner();
            
            // Verify the signer address matches the connected account
            const signerAddress = await web3Signer.getAddress();
            if (signerAddress.toLowerCase() !== accounts[0].toLowerCase()) {
                throw new Error('Signer address mismatch. Please refresh and try again.');
            }
            
            // Get network info
            const network = await web3Provider.getNetwork();
            console.log('Connected to network:', network.name, 'Chain ID:', network.chainId);
            
            setProvider(web3Provider);
            setSigner(web3Signer);
            setAccount(accounts[0]);
            
            // Create contract instance with proper signer
            try {
                const contractInstance = new ethers.Contract(
                    CONTRACT_ADDRESS,
                    contractABI,
                    web3Signer // Use signer instead of provider for write operations
                );
                
                // Test contract connection
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
            
            // Handle specific MetaMask errors
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

    const handleImageUpload = (event, isExternal = false) => {
        const file = event.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                setError('Please select a valid image file (JPEG, PNG, GIF, etc.)');
                return;
            }
            
            // Validate file size (10MB limit)
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
            
            // Create FormData for file upload
            const formData = new FormData();
            formData.append('file', file);
            
            // Add metadata
            const pinataMetadata = JSON.stringify({
                name: `Property-${Date.now()}-${file.name}`,
                keyvalues: {
                    type: 'property-image',
                    uploadedAt: new Date().toISOString()
                }
            });
            formData.append('pinataMetadata', pinataMetadata);
            
            // Upload file to Pinata
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
            
            // Validation
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

            // Verify we still have access to the account
            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            setSuccess('Uploading image to IPFS...');
            
            // Upload image to IPFS
            const imageURI = await uploadToPinata(selectedImage);
            
            setSuccess('Image uploaded! Creating property NFT...');
            
            // Prepare property parameters
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
            
            // Estimate gas first
            try {
                const gasEstimate = await contract.mintProperty.estimateGas(propertyParams);
                const gasLimit = gasEstimate * 120n / 100n; // Add 20% buffer
                
                console.log('Gas estimate:', gasEstimate.toString());
                console.log('Gas limit:', gasLimit.toString());
                
                // Create property NFT
                const tx = await contract.mintProperty(propertyParams, {
                    gasLimit: gasLimit
                });
                
                setSuccess('Transaction submitted! Waiting for confirmation...');
                console.log('Transaction hash:', tx.hash);
                
                const receipt = await tx.wait();
                console.log('Transaction confirmed:', receipt);
                
                setSuccess('Property NFT created and listed successfully!');
                
                // Reset form
                setPropertyForm({
                    name: '',
                    description: '',
                    propertyAddress: '',
                    ownerDetails: '',
                    priceInETH: ''
                });
                setSelectedImage(null);
                setImagePreview('');
                
                // Reload data
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
            
            // Validation
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

            // Verify we still have access to the account
            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            setSuccess('Uploading image to IPFS...');
            
            // Upload image to IPFS
            const imageURI = await uploadToPinata(externalImage);
            
            setSuccess('Image uploaded! Listing external NFT...');
            
            // Prepare external listing parameters
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
            
            // Estimate gas first
            try {
                const gasEstimate = await contract.listExternalNFT.estimateGas(externalParams);
                const gasLimit = gasEstimate * 120n / 100n; // Add 20% buffer
                
                // List external NFT
                const tx = await contract.listExternalNFT(externalParams, {
                    gasLimit: gasLimit
                });
                
                setSuccess('Transaction submitted! Waiting for confirmation...');
                console.log('Transaction hash:', tx.hash);
                
                const receipt = await tx.wait();
                console.log('Transaction confirmed:', receipt);
                
                setSuccess('External NFT listed successfully!');
                
                // Reset form
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
                
                // Reload data
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

            // Verify we still have access to the account
            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            console.log('Purchasing property:', { tokenId, priceInWei });
            
            // Estimate gas first
            try {
                const gasEstimate = await contract.purchaseProperty.estimateGas(tokenId, {
                    value: priceInWei
                });
                const gasLimit = gasEstimate * 120n / 100n; // Add 20% buffer
                
                const tx = await contract.purchaseProperty(tokenId, {
                    value: priceInWei,
                    gasLimit: gasLimit
                });
                
                setSuccess('Purchase transaction submitted! Waiting for confirmation...');
                const receipt = await tx.wait();
                setSuccess('Property purchased successfully!');
                
                // Reload data
                setTimeout(() => {
                    loadMarketplaceData();
                    loadUserProperties();
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
            
            if (!contract || !account) {
                throw new Error('Please connect your wallet first');
            }

            // Verify we still have access to the account
            const currentAccounts = await window.ethereum.request({
                method: 'eth_accounts'
            });
            
            if (!currentAccounts.includes(account)) {
                throw new Error('Account access lost. Please reconnect your wallet.');
            }
            
            console.log('Purchasing external NFT:', { listingId, priceInWei });
            
            // Estimate gas first
            try {
                const gasEstimate = await contract.purchaseExternalNFT.estimateGas(listingId, {
                    value: priceInWei
                });
                const gasLimit = gasEstimate * 120n / 100n; // Add 20% buffer
                
                const tx = await contract.purchaseExternalNFT(listingId, {
                    value: priceInWei,
                    gasLimit: gasLimit
                });
                
                setSuccess('Purchase transaction submitted! Waiting for confirmation...');
                const receipt = await tx.wait();
                setSuccess('External NFT purchased successfully!');
                
                // Reload data
                setTimeout(() => {
                    loadMarketplaceData();
                    loadUserExternalListings();
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

    // Enhanced loadMarketplaceData with better error handling
    const loadMarketplaceData = async () => {
        try {
            if (!contract) return;
            
            console.log('Loading marketplace data...');
            
            // Load internal properties using the contract's getter function
            const listedTokenIds = await contract.getListedProperties();
            console.log('Listed token IDs:', listedTokenIds);
            
            const internalProperties = [];
            
            for (let tokenId of listedTokenIds) {
                try {
                    // Enhanced validation
                    const tokenIdNum = Number(tokenId);
                    if (tokenIdNum <= 0) {
                        console.warn(`Invalid token ID: ${tokenId}`);
                        continue;
                    }
                    
                    // Check if property exists first
                    const propertyExists = await contract.propertyExists(tokenId);
                    console.log(`Property ${tokenId} exists:`, propertyExists);
                    
                    if (propertyExists) {
                        const [propertyWithDetails, priceInUSD] = await contract.getPropertyWithUSDPrice(tokenId);
                        console.log(`Property ${tokenId} details:`, propertyWithDetails);
                        
                        // Additional validation
                        if (propertyWithDetails.exists && propertyWithDetails.isListed && !propertyWithDetails.isSold) {
                            internalProperties.push({
                                ...propertyWithDetails,
                                priceInUSD: priceInUSD.toString(),
                                isInternal: true,
                                tokenId: tokenId.toString(),
                                priceInWei: propertyWithDetails.priceInWei.toString(),
                                owner: propertyWithDetails.owner
                            });
                        }
                    }
                } catch (err) {
                    console.error(`Error loading property ${tokenId}:`, err);
                    // Continue with next property instead of breaking
                }
            }
            
            // Load external listings
            const externalListingIds = await contract.getActiveExternalListings();
            console.log('External listing IDs:', externalListingIds);
            
            const externalListings = [];
            
            for (let listingId of externalListingIds) {
                try {
                    // Enhanced validation
                    const listingIdNum = Number(listingId);
                    if (listingIdNum <= 0) {
                        console.warn(`Invalid listing ID: ${listingId}`);
                        continue;
                    }
                    
                    // Check if listing exists first
                    const listingExists = await contract.externalListingExists(listingId);
                    console.log(`External listing ${listingId} exists:`, listingExists);
                    
                    if (listingExists) {
                        const [listingWithDetails, priceInUSD] = await contract.getExternalListingWithUSDPrice(listingId);
                        console.log(`External listing ${listingId} details:`, listingWithDetails);
                        
                        // Additional validation
                        if (listingWithDetails.exists && listingWithDetails.isActive && !listingWithDetails.isSold) {
                            externalListings.push({
                                ...listingWithDetails,
                                priceInUSD: priceInUSD.toString(),
                                isInternal: false,
                                listingId: listingId.toString(),
                                priceInWei: listingWithDetails.priceInWei.toString(),
                                owner: listingWithDetails.owner
                            });
                        }
                    }
                } catch (err) {
                    console.error(`Error loading external listing ${listingId}:`, err);
                    // Continue with next listing instead of breaking
                }
            }
            
            const allProperties = [...internalProperties, ...externalListings];
            setListedProperties(allProperties);
            console.log('Loaded properties:', allProperties);
            
        } catch (err) {
            console.error('Failed to load marketplace data:', err);
            setError('Failed to load marketplace data: ' + err.message);
        }
    };

    // Enhanced loadUserProperties with better error handling
    const loadUserProperties = async () => {
        try {
            if (!contract || !account) return;
            
            console.log('Loading user properties for:', account);
            
            // Get user's token IDs from the contract
            const userTokenIds = await contract.getUserProperties(account);
            console.log('User token IDs:', userTokenIds);
            
            const properties = [];
            
            for (let tokenId of userTokenIds) {
                try {
                    // Enhanced validation
                    const tokenIdNum = Number(tokenId);
                    if (tokenIdNum <= 0) {
                        console.warn(`Invalid user token ID: ${tokenId}`);
                        continue;
                    }
                    
                    // Check if property exists first
                    const propertyExists = await contract.propertyExists(tokenId);
                    console.log(`User property ${tokenId} exists:`, propertyExists);
                    
                    if (propertyExists) {
                        const [propertyWithDetails, priceInUSD] = await contract.getPropertyWithUSDPrice(tokenId);
                        console.log(`User property ${tokenId} details:`, propertyWithDetails);
                        
                        // Validate ownership
                        if (propertyWithDetails.exists) {
                            properties.push({
                                ...propertyWithDetails,
                                priceInUSD: priceInUSD.toString(),
                                tokenId: tokenId.toString(),
                                priceInWei: propertyWithDetails.priceInWei.toString()
                            });
                        }
                    }
                } catch (err) {
                    console.error(`Error loading user property ${tokenId}:`, err);
                    // Continue with next property instead of breaking
                }
            }
            
            setUserProperties(properties);
            console.log('Loaded user properties:', properties);
            
        } catch (err) {
            console.error('Failed to load user properties:', err);
            setError('Failed to load user properties: ' + err.message);
        }
    };

    // Enhanced loadUserExternalListings with better error handling
    const loadUserExternalListings = async () => {
        try {
            if (!contract || !account) return;
            
            console.log('Loading user external listings for:', account);
            
            // Get user's external listing IDs from the contract
            const userListingIds = await contract.getUserExternalListings(account);
            console.log('User external listing IDs:', userListingIds);
            
            const listings = [];
            
            for (let listingId of userListingIds) {
                try {
                    // Enhanced validation
                    const listingIdNum = Number(listingId);
                    if (listingIdNum <= 0) {
                        console.warn(`Invalid user listing ID: ${listingId}`);
                        continue;
                    }
                    
                    // Check if listing exists first
                    const listingExists = await contract.externalListingExists(listingId);
                    console.log(`User external listing ${listingId} exists:`, listingExists);
                    
                    if (listingExists) {
                        const [listingWithDetails, priceInUSD] = await contract.getExternalListingWithUSDPrice(listingId);
                        console.log(`User external listing ${listingId} details:`, listingWithDetails);
                        
                        // Validate ownership
                        if (listingWithDetails.exists) {
                            listings.push({
                                ...listingWithDetails,
                                priceInUSD: priceInUSD.toString(),
                                listingId: listingId.toString(),
                                priceInWei: listingWithDetails.priceInWei.toString()
                            });
                        }
                    }
                } catch (err) {
                    console.error(`Error loading user external listing ${listingId}:`, err);
                    // Continue with next listing instead of breaking
                }
            }
            
            setUserExternalListings(listings);
            console.log('Loaded user external listings:', listings);
            
        } catch (err) {
            console.error('Failed to load user external listings:', err);
            setError('Failed to load user external listings: ' + err.message);
        }
    };

    // Helper functions
    const formatAddress = (address) => {
        if (!address || typeof address !== 'string') {
            return '';
        }
        
        const addressStr = address.toString();
        if (addressStr.length < 10) {
            return addressStr;
        }
        
        return `${addressStr.slice(0, 6)}...${addressStr.slice(-4)}`;
    };

    const formatPrice = (priceInWei) => {
        try {
            if (!priceInWei) return '0';
            return ethers.formatEther(priceInWei.toString());
        } catch (err) {
            console.error('Error formatting price:', err);
            return '0';
        }
    };

    const clearMessages = () => {
        setError('');
        setSuccess('');
    };

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-content">
                    <h1 className="header-title">🏠 PropertyNFT Marketplace</h1>
                    <div className="header-info">
                        <div className="contract-info">
                            Contract: {formatAddress(CONTRACT_ADDRESS)}
                        </div>
                        {!account ? (
                            <button 
                                onClick={connectWallet} 
                                disabled={isConnecting} 
                                className="connect-btn"
                            >
                                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                            </button>
                        ) : (
                            <div className="account-info">
                                <span>Connected: {formatAddress(account)}</span>
                                <button 
                                    onClick={() => {
                                        setAccount('');
                                        setContract(null);
                                        setSigner(null);
                                        setListedProperties([]);
                                        setUserProperties([]);
                                        setUserExternalListings([]);
                                    }}
                                    className="disconnect-btn"
                                >
                                    Disconnect
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {error && (
                <div className="error-message">
                    <span>{error}</span>
                    <button onClick={clearMessages} className="close-btn">×</button>
                </div>
            )}
            
            {success && (
                <div className="success-message">
                    <span>{success}</span>
                    <button onClick={clearMessages} className="close-btn">×</button>
                </div>
            )}

            {account && (
                <>
                    <nav className="tab-navigation">
                        <button 
                            className={activeTab === 'marketplace' ? 'active' : ''}
                            onClick={() => setActiveTab('marketplace')}
                        >
                            🏪 Marketplace ({listedProperties.length})
                        </button>
                        <button 
                            className={activeTab === 'create' ? 'active' : ''}
                            onClick={() => setActiveTab('create')}
                        >
                            ➕ Create Property
                        </button>
                        <button 
                            className={activeTab === 'list-external' ? 'active' : ''}
                            onClick={() => setActiveTab('list-external')}
                        >
                            📋 List External NFT
                        </button>
                        <button 
                            className={activeTab === 'my-properties' ? 'active' : ''}
                            onClick={() => setActiveTab('my-properties')}
                        >
                            🏡 My Properties ({userProperties.length})
                        </button>
                        <button 
                            className={activeTab === 'my-listings' ? 'active' : ''}
                            onClick={() => setActiveTab('my-listings')}
                        >
                            📝 My Listings ({userExternalListings.length})
                        </button>
                    </nav>

                    {activeTab === 'marketplace' && (
                        <div className="marketplace-section">
                            <div className="section-header">
                                <h2>🏪 Available Properties & NFTs</h2>
                                <button 
                                    onClick={loadMarketplaceData} 
                                    disabled={loading}
                                    className="refresh-btn"
                                >
                                    {loading ? '🔄 Loading...' : '🔄 Refresh'}
                                </button>
                            </div>
                            
                            {listedProperties.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">🏠</div>
                                    <h3>No Properties Available</h3>
                                    <p>Be the first to list a property on our marketplace!</p>
                                    <button 
                                        onClick={() => setActiveTab('create')}
                                        className="create-first-btn"
                                    >
                                        Create First Property
                                    </button>
                                </div>
                            ) : (
                                <div className="properties-grid">
                                    {listedProperties.map((property, index) => (
                                        <div key={`${property.isInternal ? 'internal' : 'external'}-${property.tokenId || property.listingId}-${index}`} className="property-card">
                                            <div className="property-image-container">
                                                <img 
                                                    src={property.imageURI} 
                                                    alt={property.name}
                                                    className="property-image"
                                                    onError={(e) => {
                                                        e.target.src = 'https://via.placeholder.com/300x200?text=Image+Not+Found';
                                                    }}
                                                />
                                                <div className="property-type-badge">
                                                    <span className={`type-badge ${property.isInternal ? 'internal' : 'external'}`}>
                                                        {property.isInternal ? '🏠 Internal NFT' : '🔗 External NFT'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="property-details">
                                                <h3>{property.name}</h3>
                                                <p className="property-address">📍 {property.propertyAddress}</p>
                                                {property.description && (
                                                    <p className="property-description">{property.description}</p>
                                                )}
                                                <div className="property-price">
                                                    <div className="price-eth">
                                                        💎 {formatPrice(property.priceInWei)} ETH
                                                    </div>
                                                    <div className="price-usd">
                                                        💵 ~${property.priceInUSD} USD
                                                    </div>
                                                </div>
                                                <p className="owner">👤 Owner: {formatAddress(property.owner)}</p>
                                                
                                                {property.owner && property.owner.toLowerCase() !== account.toLowerCase() && (
                                                    <button 
                                                        onClick={() => {
                                                            if (property.isInternal) {
                                                                purchaseProperty(property.tokenId, property.priceInWei);
                                                            } else {
                                                                purchaseExternalNFT(property.listingId, property.priceInWei);
                                                            }
                                                        }}
                                                        disabled={loading}
                                                        className="purchase-btn"
                                                    >
                                                        {loading ? '⏳ Processing...' : '🛒 Purchase Now'}
                                                    </button>
                                                )}
                                                {property.owner && property.owner.toLowerCase() === account.toLowerCase() && (
                                                    <div className="owner-badge">✅ You own this property</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'create' && (
                        <div className="create-section">
                            <div className="section-header">
                                <h2>➕ Create New Property NFT</h2>
                            </div>
                            <div className="create-form">
                                <div className="form-group">
                                    <label>🖼️ Property Image *</label>
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={(e) => handleImageUpload(e, false)}
                                        className="file-input"
                                        disabled={loading}
                                    />
                                    {imagePreview && (
                                        <div className="image-preview-container">
                                            <img src={imagePreview} alt="Preview" className="image-preview" />
                                        </div>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label>🏠 Property Name *</label>
                                    <input 
                                        type="text"
                                        value={propertyForm.name}
                                        onChange={(e) => setPropertyForm({...propertyForm, name: e.target.value})}
                                        placeholder="Enter property name"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>📍 Property Address *</label>
                                    <input 
                                        type="text"
                                        value={propertyForm.propertyAddress}
                                        onChange={(e) => setPropertyForm({...propertyForm, propertyAddress: e.target.value})}
                                        placeholder="Enter property address"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>📝 Description</label>
                                    <textarea 
                                        value={propertyForm.description}
                                        onChange={(e) => setPropertyForm({...propertyForm, description: e.target.value})}
                                        placeholder="Enter property description"
                                        className="textarea-input"
                                        rows="4"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>👤 Owner Details</label>
                                    <input 
                                        type="text"
                                        value={propertyForm.ownerDetails}
                                        onChange={(e) => setPropertyForm({...propertyForm, ownerDetails: e.target.value})}
                                        placeholder="Enter owner details"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>💎 Price (ETH) *</label>
                                    <input 
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={propertyForm.priceInETH}
                                        onChange={(e) => setPropertyForm({...propertyForm, priceInETH: e.target.value})}
                                        placeholder="Enter price in ETH"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <button 
                                    onClick={createProperty}
                                    disabled={loading || !selectedImage || !propertyForm.name || !propertyForm.propertyAddress || !propertyForm.priceInETH}
                                    className="create-btn"
                                >
                                    {loading ? '⏳ Creating...' : '🚀 Create & List Property'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'list-external' && (
                        <div className="create-section">
                            <div className="section-header">
                                <h2>📋 List External NFT</h2>
                            </div>
                            <div className="create-form">
                                <div className="form-group">
                                    <label>🖼️ NFT Image *</label>
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={(e) => handleImageUpload(e, true)}
                                        className="file-input"
                                        disabled={loading}
                                    />
                                    {externalImagePreview && (
                                        <div className="image-preview-container">
                                            <img src={externalImagePreview} alt="Preview" className="image-preview" />
                                        </div>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label>📄 NFT Contract Address *</label>
                                    <input 
                                        type="text"
                                        value={externalNFTForm.nftContract}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, nftContract: e.target.value})}
                                        placeholder="Enter NFT contract address"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>🔢 Token ID *</label>
                                    <input 
                                        type="number"
                                        value={externalNFTForm.tokenId}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, tokenId: e.target.value})}
                                        placeholder="Enter token ID"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>🏷️ NFT Name *</label>
                                    <input 
                                        type="text"
                                        value={externalNFTForm.name}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, name: e.target.value})}
                                        placeholder="Enter NFT name"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>📍 Property Address</label>
                                    <input 
                                        type="text"
                                        value={externalNFTForm.propertyAddress}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, propertyAddress: e.target.value})}
                                        placeholder="Enter property address (if applicable)"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>📝 Description</label>
                                    <textarea 
                                        value={externalNFTForm.description}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, description: e.target.value})}
                                        placeholder="Enter NFT description"
                                        className="textarea-input"
                                        rows="4"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>👤 Owner Details</label>
                                    <input 
                                        type="text"
                                        value={externalNFTForm.ownerDetails}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, ownerDetails: e.target.value})}
                                        placeholder="Enter owner details"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>💎 Price (ETH) *</label>
                                    <input 
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={externalNFTForm.priceInETH}
                                        onChange={(e) => setExternalNFTForm({...externalNFTForm, priceInETH: e.target.value})}
                                        placeholder="Enter price in ETH"
                                        className="text-input"
                                        disabled={loading}
                                    />
                                </div>

                                <button 
                                    onClick={listExternalNFT}
                                    disabled={loading || !externalImage || !externalNFTForm.nftContract || !externalNFTForm.tokenId || !externalNFTForm.name || !externalNFTForm.priceInETH}
                                    className="create-btn"
                                >
                                    {loading ? '⏳ Listing...' : '📋 List External NFT'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'my-properties' && (
                        <div className="my-properties-section">
                            <div className="section-header">
                                <h2>🏡 My Properties</h2>
                                <button 
                                    onClick={loadUserProperties} 
                                    disabled={loading}
                                    className="refresh-btn"
                                >
                                    {loading ? '🔄 Loading...' : '🔄 Refresh'}
                                </button>
                            </div>
                            
                            {userProperties.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">🏡</div>
                                    <h3>No Properties Owned</h3>
                                    <p>You don't own any properties yet. Create your first property to get started!</p>
                                    <button 
                                        onClick={() => setActiveTab('create')}
                                        className="create-first-btn"
                                    >
                                        Create Your First Property
                                    </button>
                                </div>
                            ) : (
                                <div className="properties-grid">
                                    {userProperties.map((property, index) => (
                                        <div key={`user-${property.tokenId}-${index}`} className="property-card">
                                            <div className="property-image-container">
                                                <img 
                                                    src={property.imageURI} 
                                                    alt={property.name}
                                                    className="property-image"
                                                    onError={(e) => {
                                                        e.target.src = 'https://via.placeholder.com/300x200?text=Image+Not+Found';
                                                    }}
                                                />
                                            </div>
                                            <div className="property-details">
                                                <h3>{property.name}</h3>
                                                <p className="property-address">📍 {property.propertyAddress}</p>
                                                {property.description && (
                                                    <p className="property-description">{property.description}</p>
                                                )}
                                                <div className="property-status">
                                                    <span className={`status ${property.isListed ? 'listed' : 'unlisted'}`}>
                                                        {property.isListed ? '🟢 Listed for Sale' : '🔴 Not Listed'}
                                                    </span>
                                                    {property.isSold && (
                                                        <span className="status sold">✅ Sold</span>
                                                    )}
                                                </div>
                                                {property.isListed && (
                                                    <div className="property-price">
                                                        <div className="price-eth">
                                                            💎 {formatPrice(property.priceInWei)} ETH
                                                        </div>
                                                        <div className="price-usd">
                                                            💵 ~${property.priceInUSD} USD
                                                        </div>
                                                    </div>
                                                )}
                                                <p className="token-id">🔢 Token ID: {property.tokenId}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'my-listings' && (
                        <div className="my-properties-section">
                            <div className="section-header">
                                <h2>📝 My External NFT Listings</h2>
                                <button 
                                    onClick={loadUserExternalListings} 
                                    disabled={loading}
                                    className="refresh-btn"
                                >
                                    {loading ? '🔄 Loading...' : '🔄 Refresh'}
                                </button>
                            </div>
                            
                            {userExternalListings.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">📝</div>
                                    <h3>No External Listings</h3>
                                    <p>You haven't listed any external NFTs yet. List your first external NFT to get started!</p>
                                    <button 
                                        onClick={() => setActiveTab('list-external')}
                                        className="create-first-btn"
                                    >
                                        List Your First External NFT
                                    </button>
                                </div>
                            ) : (
                                <div className="properties-grid">
                                    {userExternalListings.map((listing, index) => (
                                        <div key={`listing-${listing.listingId}-${index}`} className="property-card">
                                            <div className="property-image-container">
                                                <img 
                                                    src={listing.imageURI} 
                                                    alt={listing.name}
                                                    className="property-image"
                                                    onError={(e) => {
                                                        e.target.src = 'https://via.placeholder.com/300x200?text=Image+Not+Found';
                                                    }}
                                                />
                                                <div className="property-type-badge">
                                                    <span className="type-badge external">🔗 External NFT</span>
                                                </div>
                                            </div>
                                            <div className="property-details">
                                                <h3>{listing.name}</h3>
                                                <p className="property-address">📄 Contract: {formatAddress(listing.nftContract)}</p>
                                                <p className="property-address">🔢 Token ID: {listing.tokenId}</p>
                                                {listing.description && (
                                                    <p className="property-description">{listing.description}</p>
                                                )}
                                                <div className="property-status">
                                                    <span className={`status ${listing.isActive ? 'listed' : 'unlisted'}`}>
                                                        {listing.isActive ? '🟢 Active Listing' : '🔴 Inactive'}
                                                    </span>
                                                    {listing.isSold && (
                                                        <span className="status sold">✅ Sold</span>
                                                    )}
                                                </div>
                                                {listing.isActive && (
                                                    <div className="property-price">
                                                        <div className="price-eth">
                                                            💎 {formatPrice(listing.priceInWei)} ETH
                                                        </div>
                                                        <div className="price-usd">
                                                            💵 ~${listing.priceInUSD} USD
                                                        </div>
                                                    </div>
                                                )}
                                                <p className="token-id">📋 Listing ID: {listing.listingId}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default PropertyNFTMarketplace;
