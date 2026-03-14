"use client";
import React from 'react';
import styles from './MainContent.module.css';
import { useGameConfig } from '@/lib/GameContext';
import ReactMarkdown from 'react-markdown';

export default function MainContent() {
    const { searchResult, isSearchingQuery } = useGameConfig();

    if (isSearchingQuery) {
        return (
            <div className={styles.mainWrapper}>
                <div className={styles.container}>
                    <div className={styles.placeholderCard}>
                        <div className={styles.spinner}></div>
                        <h2>Consulting the Sage...</h2>
                        <p>Analyzing optimal strategies and sourcing intelligence.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!searchResult) {
        return (
            <div className={styles.mainWrapper}>
                <div className={styles.container}>
                    <div className={styles.placeholderCard}>
                        <h2>Awaiting Query</h2>
                        <p>Select an experience and specify your intent to receive Sage guidance.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.mainWrapper}>
            <div className={styles.container}>

                <div className={styles.guideCard}>
                    <div className={styles.guideHeader}>
                        <h2 className={styles.sectionTitle}>Gemini Strategy Guide</h2>
                        <div className={styles.badge}>AI Generated</div>
                    </div>
                    <div className={styles.markdownBody}>
                        <ReactMarkdown
                            components={{
                                img: ({ node, ...props }) => (
                                    <img {...props} referrerPolicy="no-referrer" />
                                )
                            }}
                        >
                            {searchResult.gemini_output}
                        </ReactMarkdown>
                    </div>
                </div>

            </div>
        </div>
    );
}
