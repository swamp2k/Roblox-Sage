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
                        <p>Analyzing optimal strategies and sourcing video intelligence.</p>
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
                        <ReactMarkdown>{searchResult.gemini_output}</ReactMarkdown>
                    </div>
                </div>

                <div className={styles.videoSection}>
                    <h2 className={styles.sectionTitle}>Video Intelligence</h2>
                    <div className={styles.tableContainer}>
                        <table className={styles.videoTable}>
                            <thead>
                                <tr>
                                    <th>Creator</th>
                                    <th>Title</th>
                                    <th>Views</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {searchResult.youtube_json.map((video, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div className={styles.creatorCell}>
                                                <img src={video.thumbnailUrl} alt="thumbnail" className={styles.thumbnail} />
                                                <span className={styles.creatorName}>{video.channelTitle}</span>
                                            </div>
                                        </td>
                                        <td className={styles.titleCell}>{video.title}</td>
                                        <td className={styles.viewsCell}>{video.viewCount}</td>
                                        <td>
                                            <a
                                                href={`https://youtube.com/watch?v=${video.videoId}&t=${video.timestamp}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={styles.playLink}
                                            >
                                                <span className={styles.playIcon}>▶</span>
                                                Watch from {Math.floor(video.timestamp / 60)}:{(video.timestamp % 60).toString().padStart(2, '0')}
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
