"use client";
import React, { useState, useEffect } from 'react';
import styles from './Sidebar.module.css';
import { useGameConfig } from '@/lib/GameContext';

type Game = {
    id: number;
    name: string;
    wiki_url: string;
};

export default function Sidebar() {
    const {
        selectedGame, setSelectedGame,
        intentQuery, setIntentQuery,
        setSearchResult, isSearchingQuery, setIsSearchingQuery
    } = useGameConfig();

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<Game[]>([]);
    const [recentGames, setRecentGames] = useState<Game[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('recentGames');
        if (saved) {
            try {
                setRecentGames(JSON.parse(saved));
            } catch (e) {
                console.error(e);
            }
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchTerm.trim() === '') {
                setSuggestions([]);
                if (recentGames.length === 0) {
                    setShowDropdown(false);
                }
                return;
            }

            // Prevent dropdown from reopening immediately after a selection
            if (selectedGame && selectedGame.name === searchTerm) {
                setSuggestions([]);
                return;
            }

            setIsSearching(true);
            try {
                const res = await fetch(`/api/experiences?q=${encodeURIComponent(searchTerm)}`);
                const data = await res.json() as any[];
                setSuggestions(data);
                setShowDropdown(true);
            } catch (e) {
                console.error(e);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleSelectGame = (game: Game) => {
        setSelectedGame(game);
        setSearchTerm(game.name);
        setShowDropdown(false);

        setRecentGames(prev => {
            const filtered = prev.filter(g => g.id !== game.id);
            const updated = [game, ...filtered].slice(0, 8);
            localStorage.setItem('recentGames', JSON.stringify(updated));
            return updated;
        });
    };

    const handleSeekWisdom = async () => {
        if (!selectedGame || !intentQuery) return;

        setIsSearchingQuery(true);
        setSearchResult(null);
        try {
            const res = await fetch(`/api/search?gameId=${selectedGame.id}&query=${encodeURIComponent(intentQuery)}`);
            const data = await res.json() as any;
            setSearchResult(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingQuery(false);
        }
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.header}>
                <h1 className={styles.title}>Roblox Sage</h1>
                <p className={styles.subtitle}>Discovery Engine</p>
            </div>

            <div className={styles.fieldGroup}>
                <label className={styles.label}>1. Select Experience</label>
                <div className={styles.inputWrapper}>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="Search games..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => {
                            if (suggestions.length > 0 || (searchTerm.trim() === '' && recentGames.length > 0)) {
                                setShowDropdown(true);
                            }
                        }}
                        onBlur={() => {
                            setTimeout(() => setShowDropdown(false), 200);
                        }}
                    />
                    {showDropdown && (
                        <div className={styles.dropdown}>
                            {isSearching ? (
                                <div className={styles.dropdownItem}>Searching...</div>
                            ) : searchTerm.trim() !== '' ? (
                                suggestions.length > 0 ? (
                                    suggestions.map(game => (
                                        <div
                                            key={game.id}
                                            className={styles.dropdownItem}
                                            onClick={() => handleSelectGame(game)}
                                        >
                                            {game.name}
                                        </div>
                                    ))
                                ) : (
                                    <div className={styles.dropdownItem}>No games found.</div>
                                )
                            ) : (
                                recentGames.length > 0 ? (
                                    <>
                                        <div className={styles.dropdownHeader}>Recent Experiences</div>
                                        {recentGames.map(game => (
                                            <div
                                                key={`recent-${game.id}`}
                                                className={styles.dropdownItem}
                                                onClick={() => handleSelectGame(game)}
                                            >
                                                {game.name}
                                            </div>
                                        ))}
                                    </>
                                ) : null
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.fieldGroup}>
                <label className={styles.label}>2. User Intent</label>
                <div className={styles.inputWrapper}>
                    <textarea
                        className={styles.input}
                        placeholder="e.g., 'how to beat the Level 50 boss'"
                        value={intentQuery}
                        onChange={(e) => setIntentQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (selectedGame && intentQuery && !isSearchingQuery) {
                                    handleSeekWisdom();
                                }
                            }
                        }}
                        rows={3}
                        style={{ resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' }}
                    />
                </div>
            </div>

            <button
                className={styles.submitButton}
                disabled={!selectedGame || !intentQuery || isSearchingQuery}
                onClick={handleSeekWisdom}
            >
                {isSearchingQuery ? 'Consulting Oracle...' : 'Seek Wisdom'}
            </button>
        </aside>
    );
}
