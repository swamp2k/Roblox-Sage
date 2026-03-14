"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

type Game = {
    id: number;
    name: string;
    wiki_url: string;
};

export type VideoResult = {
    videoId: string;
    title: string;
    channelTitle: string;
    viewCount: string;
    thumbnailUrl: string;
    timestamp: number;
};

export type SearchResult = {
    gemini_output: string;
    youtube_json: VideoResult[];
};

type GameContextType = {
    selectedGame: Game | null;
    setSelectedGame: (game: Game | null) => void;
    intentQuery: string;
    setIntentQuery: (query: string) => void;
    searchResult: SearchResult | null;
    setSearchResult: (result: SearchResult | null) => void;
    isSearchingQuery: boolean;
    setIsSearchingQuery: (status: boolean) => void;
    videoAgeLimit: string;
    setVideoAgeLimit: (limit: string) => void;
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);
    const [intentQuery, setIntentQuery] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [isSearchingQuery, setIsSearchingQuery] = useState(false);
    const [videoAgeLimit, setVideoAgeLimit] = useState('1y');

    return (
        <GameContext.Provider value={{
            selectedGame, setSelectedGame,
            intentQuery, setIntentQuery,
            searchResult, setSearchResult,
            isSearchingQuery, setIsSearchingQuery,
            videoAgeLimit, setVideoAgeLimit
        }}>
            {children}
        </GameContext.Provider>
    );
}

export function useGameConfig() {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGameConfig must be used within a GameProvider');
    }
    return context;
}
