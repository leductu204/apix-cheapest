/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppControls, useImageEditor, ExtraTools } from './uiUtils';
import { cn } from '../lib/utils';
import { 
    HomeIcon, 
    BackIcon, 
    ForwardIcon, 
    SearchIcon, 
    InfoIcon, 
    GalleryIcon, 
    EditorIcon, 
    LayerComposerIcon, 
    EllipsisIcon,
    HistoryIcon,
    StoryboardIcon,
    SettingsIcon,
    CloseIcon
} from './icons';
import toast from 'react-hot-toast';

const AppToolbar: React.FC = () => {
    const {
        currentView,
        historyIndex,
        viewHistory,
        handleGoHome,
        handleGoBack,
        handleGoForward,
        handleOpenGallery,
        handleOpenSearch,
        handleOpenInfo,
        handleOpenHistoryPanel,
        addImagesToGallery,
        isExtraToolsOpen,
        toggleExtraTools,
        isLayerComposerVisible,
        toggleLayerComposer,
        isStoryboardingModalVisible,
        toggleStoryboardingModal,
        t,
        isHistoryPanelOpen,
        handleCloseHistoryPanel,
    } = useAppControls();

    const { openEmptyImageEditor, imageToEdit } = useImageEditor();

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tstKey, setTstKey] = useState(() => localStorage.getItem('tramsangtao_api_key') || '');
    const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');

    const saveSettings = () => {
        localStorage.setItem('tramsangtao_api_key', tstKey);
        localStorage.setItem('gemini_api_key', geminiKey);
        toast.success('Đã lưu cấu hình API Key');
        setIsSettingsOpen(false);
    };

    const [activeTooltip, setActiveTooltip] = useState<{ text: string; rect: DOMRect } | null>(null);
    const tooltipTimeoutRef = useRef<number | null>(null);

    const showTooltip = (text: string, e: React.MouseEvent) => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        const target = e.currentTarget as HTMLElement;
        tooltipTimeoutRef.current = window.setTimeout(() => {
            if (document.body.contains(target)) {
                const rect = target.getBoundingClientRect();
                setActiveTooltip({ text, rect });
            }
        }, 500);
    };

    const hideTooltip = () => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        setActiveTooltip(null);
    };


    const handleOpenEditor = useCallback(() => {
        openEmptyImageEditor((newUrl) => {
            addImagesToGallery([newUrl]);
        });
    }, [openEmptyImageEditor, addImagesToGallery]);

    // Welcome notification
    useEffect(() => {
        const hasShownWelcome = sessionStorage.getItem('hasShownWelcome');
        const currentTstKey = localStorage.getItem('tramsangtao_api_key');
        if (!hasShownWelcome || !currentTstKey) {
            toast((t) => (
                <div className="flex flex-col gap-3 p-2">
                    <span className="font-semibold text-base text-center">Cộng đồng AI Art Việt Nam X TramSangTao</span>
                    <span className="text-sm text-center text-white/80">Vui lòng cung cấp API Key để lưu cấu hình<br/>sử dụng các chức năng tự động.</span>
                    <button 
                        onClick={() => {
                            toast.dismiss(t.id);
                            setIsSettingsOpen(true);
                        }}
                        className="btn btn-primary mt-2 text-sm py-2 rounded-xl"
                    >
                        Mở Cài Đặt (Cấu Hình API Key)
                    </button>
                    <button 
                        onClick={() => toast.dismiss(t.id)}
                        className="btn btn-secondary text-sm py-2 rounded-xl"
                    >
                        Bỏ qua
                    </button>
                </div>
            ), { 
                duration: 20000, 
                position: 'top-center',
                style: {
                    marginTop: '35vh',
                    borderRadius: '1.25rem',
                    padding: '16px',
                    maxWidth: '400px',
                    width: '90%',
                    backgroundColor: '#1c1c1e',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.1)'
                }
            });
            sessionStorage.setItem('hasShownWelcome', 'true');
        }
    }, [setIsSettingsOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            // Ignore if user is typing in an input/textarea to avoid hijacking browser functionality.
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            const isEditorOpen = imageToEdit !== null;

            const isUndo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
            const isRedo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey;
            const isSearch = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f';
            const isGallery = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g';
            const isGoHome = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h';
            const isHistoryToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y';
            const isInfo = (e.metaKey || e.ctrlKey) && e.key === '/';
            const isEditor = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e';
            const isLayerComposer = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l';
            const isStoryboard = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b';

            if (isUndo && !isEditorOpen && !isLayerComposerVisible && !isStoryboardingModalVisible) {
                e.preventDefault();
                handleGoBack();
            } else if (isRedo && !isEditorOpen && !isLayerComposerVisible && !isStoryboardingModalVisible) {
                e.preventDefault();
                handleGoForward();
            } else if (isSearch) {
                e.preventDefault();
                handleOpenSearch();
            } else if (isGallery) {
                e.preventDefault();
                handleOpenGallery();
            } else if (isGoHome) {
                e.preventDefault();
                handleGoHome();
            } else if (isHistoryToggle) {
                e.preventDefault();
                if (isHistoryPanelOpen) {
                    handleCloseHistoryPanel();
                } else {
                    handleOpenHistoryPanel();
                }
            } else if (isInfo) {
                e.preventDefault();
                handleOpenInfo();
            } else if (isEditor && !isLayerComposerVisible) {
                e.preventDefault();
                handleOpenEditor();
            } else if (isLayerComposer) {
                e.preventDefault();
                toggleLayerComposer();
            } else if (isStoryboard) {
                e.preventDefault();
                toggleStoryboardingModal();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleGoBack, handleGoForward, handleOpenSearch, handleOpenGallery, handleGoHome, handleOpenInfo, handleOpenHistoryPanel, handleCloseHistoryPanel, isHistoryPanelOpen, handleOpenEditor, toggleLayerComposer, imageToEdit, isLayerComposerVisible, isStoryboardingModalVisible, toggleStoryboardingModal]);

    return (
        <>
            <div className="fixed top-4 right-4 z-20 flex items-center gap-2">
                {/* --- Group 1: Navigation & Info --- */}
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="btn-search bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 border border-orange-500/20"
                    aria-label="Cài đặt API"
                    onMouseEnter={(e) => showTooltip("Cài đặt API", e)}
                    onMouseLeave={hideTooltip}
                >
                    <SettingsIcon className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                    onClick={handleGoHome}
                    className="btn-search"
                    aria-label={t('appToolbar_home')}
                    disabled={currentView.viewId === 'home'}
                    onMouseEnter={(e) => showTooltip(t('appToolbar_home'), e)}
                    onMouseLeave={hideTooltip}
                >
                    <HomeIcon className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                    onClick={handleGoBack}
                    className="btn-search"
                    aria-label={t('appToolbar_back')}
                    disabled={historyIndex <= 0}
                    onMouseEnter={(e) => showTooltip(t('appToolbar_back'), e)}
                    onMouseLeave={hideTooltip}
                >
                    <BackIcon className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                    onClick={handleGoForward}
                    className="btn-search"
                    aria-label={t('appToolbar_forward')}
                    disabled={historyIndex >= viewHistory.length - 1}
                    onMouseEnter={(e) => showTooltip(t('appToolbar_forward'), e)}
                    onMouseLeave={hideTooltip}
                >
                    <ForwardIcon className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                    onClick={handleOpenSearch}
                    className="btn-search"
                    aria-label={t('appToolbar_search')}
                    onMouseEnter={(e) => showTooltip(t('appToolbar_search'), e)}
                    onMouseLeave={hideTooltip}
                >
                    <SearchIcon className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                    onClick={handleOpenInfo}
                    className="btn-search"
                    aria-label={t('appToolbar_info')}
                    onMouseEnter={(e) => showTooltip(t('appToolbar_info'), e)}
                    onMouseLeave={hideTooltip}
                >
                    <InfoIcon className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                    onClick={handleOpenHistoryPanel}
                    className="btn-search"
                    aria-label={t('appToolbar_history')}
                    onMouseEnter={(e) => showTooltip(t('appToolbar_history'), e)}
                    onMouseLeave={hideTooltip}
                >
                    <HistoryIcon className="h-5 w-5" strokeWidth={1.5} />
                </button>
                
                {/* --- Group 2: Creation & Tools (Hidden on mobile) --- */}
                <div className="hidden md:flex items-center gap-2">
                    <div className="w-px h-5 bg-white/20 mx-1 self-center" />
                    <button
                        onClick={handleOpenGallery}
                        className="btn-gallery"
                        aria-label={t('appToolbar_gallery')}
                        onMouseEnter={(e) => showTooltip(t('appToolbar_gallery'), e)}
                        onMouseLeave={hideTooltip}
                    >
                         <GalleryIcon className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                        onClick={handleOpenEditor}
                        className="btn-search"
                        aria-label={t('appToolbar_editor')}
                        onMouseEnter={(e) => showTooltip(t('appToolbar_editor'), e)}
                        onMouseLeave={hideTooltip}
                    >
                        <EditorIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={toggleLayerComposer}
                        className="btn-search"
                        aria-label={t('appToolbar_layerComposer')}
                        onMouseEnter={(e) => showTooltip(t('appToolbar_layerComposer'), e)}
                        onMouseLeave={hideTooltip}
                    >
                        <LayerComposerIcon className="h-5 w-5" strokeWidth="1.5" />
                    </button>
                    <button
                        onClick={toggleStoryboardingModal}
                        className={cn("btn-search", isStoryboardingModalVisible && 'bg-white/20')}
                        aria-label={t('extraTools_storyboarding')}
                        onMouseEnter={(e) => showTooltip(t('extraTools_storyboarding'), e)}
                        onMouseLeave={hideTooltip}
                    >
                        <StoryboardIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={toggleExtraTools}
                        className={cn("btn-search", isExtraToolsOpen && 'bg-white/20')}
                        aria-label={t('appToolbar_extra')}
                        onMouseEnter={(e) => showTooltip(t('appToolbar_extra'), e)}
                        onMouseLeave={hideTooltip}
                    >
                        <EllipsisIcon className="h-5 w-5" strokeWidth={2} />
                    </button>
                </div>
            </div>
            <ExtraTools isOpen={isExtraToolsOpen} />
            
            <AnimatePresence>
                {isSettingsOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="w-full max-w-md bg-[#1c1c1e] border border-white/10 p-6 rounded-2xl shadow-xl flex flex-col gap-5"
                        >
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-semibold text-white">⚙ Cài Đặt API Key</h3>
                                <button onClick={() => setIsSettingsOpen(false)} className="text-white/50 hover:text-white transition-colors">
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-white/80">
                                            TramSangTao API Key <span className="text-xs text-orange-400">(Bắt buộc tạo ảnh)</span>
                                        </label>
                                        <a href="https://tramsangtao.com/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                            Tạo API Key
                                        </a>
                                    </div>
                                    <input
                                        type="password"
                                        value={tstKey}
                                        onChange={e => setTstKey(e.target.value)}
                                        placeholder="sk_live_..."
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
                                    />
                                    <p className="text-xs text-white/40 mt-1">Dùng để tạo, chỉnh sửa ảnh (Nano Banana...)</p>
                                </div>
                                
                                <div className="h-px w-full bg-white/5" />

                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-1">
                                        Google Gemini API Key <span className="text-xs text-blue-400">(Tùy chọn)</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={geminiKey}
                                        onChange={e => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                    <p className="text-xs text-white/40 mt-1">Dùng để tinh chỉnh, làm mượt câu lệnh bằng LLM trước khi tạo.</p>
                                </div>
                            </div>

                            <button 
                                onClick={saveSettings}
                                className="w-full py-3 mt-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-medium rounded-xl transition-all shadow-lg active:scale-[0.98]"
                            >
                                Lưu Cấu Hình
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {activeTooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="fixed z-50 p-2 text-xs text-center text-white bg-neutral-900/80 backdrop-blur-sm border border-white/10 rounded-md shadow-lg pointer-events-none"
                        style={{
                            top: activeTooltip.rect.bottom + 8,
                            left: activeTooltip.rect.left + activeTooltip.rect.width / 2,
                            transform: 'translateX(-50%)',
                        }}
                    >
                        {activeTooltip.text}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default AppToolbar;