class CraftNavigation {
    constructor() {
        this.panelsContainer = document.getElementById('panels-container');
        this.breadcrumbList = document.querySelector('.breadcrumb-list');
        this.currentLevel = 0;
        this.panelStack = [];
        this.isMobile = window.innerWidth <= 768;
        
        // Debug logging
        console.log('CraftNavigation initialized');
        console.log('Breadcrumb list found:', this.breadcrumbList);
        console.log('Panels container found:', this.panelsContainer);
        
        this.init();
    }
    
    init() {
        // Handle window resize
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
        });
        
        // Initialize tag filtering
        this.initTagFiltering();
        
        // Handle block and link clicks
        document.addEventListener('click', (e) => {
            const block = e.target.closest('.block');
            const link = e.target.closest('a');
            
            if (block) {
                e.preventDefault();
                // Check if click is from main panel
                const isFromMain = block.closest('.main-panel') !== null;
                const isFromDetail = block.closest('.detail-panel') !== null;
                
                // Add selected class to clicked block
                if (isFromMain) {
                    // Remove selected class from all blocks in main panel
                    document.querySelectorAll('.main-panel .block-unified').forEach(b => {
                        b.classList.remove('selected');
                    });
                    // Add selected class to clicked block
                    block.classList.add('selected');
                }
                
                this.navigateToUrl(block.dataset.url, isFromMain, isFromDetail);
            } else if (link && link.href && link.href.includes(window.location.origin)) {
                // Handle internal links within content
                const isInDetailPanel = link.closest('.detail-panel') !== null;
                if (isInDetailPanel) {
                    e.preventDefault();
                    const url = new URL(link.href).pathname;
                    this.navigateToUrl(url, false, true);
                }
            }
        });
        
        // Handle browser back button
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.level !== undefined) {
                this.navigateToLevel(e.state.level, false);
            }
        });
        
        // Handle breadcrumb clicks
        if (this.breadcrumbList) {
            this.breadcrumbList.addEventListener('click', (e) => {
                const breadcrumbLink = e.target.closest('.breadcrumb-link');
                if (breadcrumbLink && breadcrumbLink.dataset.level !== undefined) {
                    e.preventDefault();
                    const targetLevel = parseInt(breadcrumbLink.dataset.level);
                    this.navigateToLevel(targetLevel);
                }
            });
        } else {
            console.error('Breadcrumb list not found!')
        }
        
        // Set initial state
        history.replaceState({ level: 0, url: '/' }, '', window.location.href);
        
        // Check if we're on a single page (direct URL access)
        this.checkDirectAccess();
    }
    
    initTagFiltering() {
        const filterTags = document.querySelectorAll('.filter-tag');
        const blockWrappers = document.querySelectorAll('.block-wrapper');
        
        if (filterTags.length === 0) return;
        
        filterTags.forEach(tag => {
            tag.addEventListener('click', () => {
                // Update active state
                filterTags.forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
                
                const selectedTag = tag.dataset.tag;
                
                // Filter blocks
                blockWrappers.forEach(wrapper => {
                    if (selectedTag === 'all') {
                        wrapper.style.display = 'block';
                    } else {
                        const blockTags = JSON.parse(wrapper.dataset.tags || '[]');
                        if (blockTags.includes(selectedTag)) {
                            wrapper.style.display = 'block';
                        } else {
                            wrapper.style.display = 'none';
                        }
                    }
                });
                
                // Smooth scroll to top of content
                const separator = document.querySelector('.content-separator');
                if (separator) {
                    separator.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }
    
    checkDirectAccess() {
        // Look for hidden detail content (indicates we're on a single page)
        const detailContent = document.getElementById('detail-content');
        if (detailContent) {
            console.log('Direct access detected, setting up detail panel');
            
            // Get the URL and title from the hidden content
            const url = detailContent.dataset.url;
            const title = detailContent.dataset.title;
            
            // Create and add detail panel
            const detailPanel = document.createElement('div');
            detailPanel.className = 'panel detail-panel';
            detailPanel.dataset.level = '1';
            detailPanel.innerHTML = detailContent.innerHTML;
            
            // Add to container
            this.panelsContainer.appendChild(detailPanel);
            
            // Update state
            this.currentLevel = 1;
            this.panelStack.push({ url, panel: detailPanel });
            
            // Update container class
            this.panelsContainer.classList.add('has-detail');
            
            // Add slight delay for animation
            setTimeout(() => {
                // Update breadcrumbs
                this.updateBreadcrumbs(url, detailPanel);
                
                // Initialize panel content
                this.initializePanelContent(detailPanel);
            }, 100);
            
            // Remove the hidden content
            detailContent.remove();
            
            // Update history to reflect current state
            history.replaceState({ level: 1, url }, '', url);
        }
    }
    
    async navigateToUrl(url, fromMainPanel = false, fromDetailPanel = false) {
        try {
            // Determine click source
            const clickedFromMain = fromMainPanel || this.currentLevel === 0;
            const clickedFromDetail = fromDetailPanel;
            
            // Handle different navigation scenarios on desktop
            if (!this.isMobile) {
                if (clickedFromMain && this.currentLevel > 0) {
                    // Clicking from main panel - replace detail and remove third panel
                    const existingDetail = this.panelsContainer.querySelector('.detail-panel');
                    const existingThird = this.panelsContainer.querySelector('.third-panel');
                    if (existingDetail) existingDetail.remove();
                    if (existingThird) {
                        existingThird.remove();
                        this.panelsContainer.classList.remove('has-third-panel');
                    }
                    this.panelStack = [];
                    this.currentLevel = 0;
                } else if (clickedFromDetail) {
                    // Clicking from detail panel - always replace third panel if it exists
                    const existingThird = this.panelsContainer.querySelector('.third-panel');
                    if (existingThird) {
                        existingThird.remove();
                        // Remove the old third panel from the stack
                        if (this.panelStack.length > 1) {
                            this.panelStack.pop();
                            // Keep level at 2 since we're replacing the third panel
                        }
                    }
                    // We'll add the new third panel below
                }
            }
            
            // Create new panel with appropriate class
            // For third panel replacement, use level 2 instead of incrementing
            const panelLevel = (clickedFromDetail && this.currentLevel >= 1) ? 2 : this.currentLevel + 1;
            const newPanel = this.createPanel(panelLevel);
            newPanel.classList.add('loading');
            if (!this.isMobile) {
                if (clickedFromDetail) {
                    newPanel.classList.add('third-panel');
                } else {
                    newPanel.classList.add('detail-panel');
                }
            }
            this.panelsContainer.appendChild(newPanel);
            
            // Fetch content
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract content
            const content = doc.querySelector('.content-panel') || 
                           doc.querySelector('.blocks-container') ||
                           doc.querySelector('[data-content]');
            
            if (content) {
                newPanel.innerHTML = content.outerHTML;
                newPanel.classList.remove('loading');
                
                // Update navigation
                // Set level appropriately
                if (clickedFromDetail && this.currentLevel === 1) {
                    // Adding third panel for first time
                    this.currentLevel = 2;
                } else if (clickedFromDetail && this.currentLevel === 2) {
                    // Replacing existing third panel - level stays at 2
                    this.currentLevel = 2;
                } else if (!clickedFromDetail) {
                    // Normal navigation
                    this.currentLevel++;
                }
                this.panelStack.push({ url, panel: newPanel });
                
                // Update URL and history
                history.pushState({ level: this.currentLevel, url }, '', url);
                
                // Update view
                this.updatePanelsView();
                
                // Update breadcrumbs
                this.updateBreadcrumbs(url, newPanel);
                
                // Initialize new content
                this.initializePanelContent(newPanel);
            }
        } catch (error) {
            console.error('Navigation error:', error);
            // Remove failed panel
            newPanel.remove();
        }
    }
    
    createPanel(level) {
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.dataset.level = level;
        return panel;
    }
    
    updatePanelsView() {
        if (this.isMobile) {
            // Mobile: Show only active panel
            const panels = this.panelsContainer.querySelectorAll('.panel');
            panels.forEach((panel, index) => {
                panel.classList.toggle('active', index === this.currentLevel);
            });
        } else {
            // Desktop: Toggle classes based on panel presence
            const hasDetail = this.panelsContainer.querySelector('.detail-panel') !== null;
            const hasThird = this.panelsContainer.querySelector('.third-panel') !== null;
            
            if (hasDetail) {
                this.panelsContainer.classList.add('has-detail');
            } else {
                this.panelsContainer.classList.remove('has-detail');
            }
            
            if (hasThird) {
                // Remove has-detail when adding has-third-panel for proper flex layout
                this.panelsContainer.classList.remove('has-detail');
                this.panelsContainer.classList.add('has-third-panel');
                
                // Auto-scroll to show the new panel after animation
                setTimeout(() => {
                    // Scroll to show the rightmost panel
                    const scrollTarget = this.panelsContainer.scrollWidth - this.panelsContainer.clientWidth;
                    this.panelsContainer.scrollTo({
                        left: scrollTarget,
                        behavior: 'smooth'
                    });
                }, 300); // Give time for panel to be added and animated
            } else {
                this.panelsContainer.classList.remove('has-third-panel');
            }
        }
    }
    
    navigateToLevel(level, updateHistory = true) {
        // If going to home (level 0), remove all panels except main
        if (level === 0) {
            while (this.panelStack.length > 0) {
                const removed = this.panelStack.pop();
                removed.panel.remove();
            }
            this.panelsContainer.classList.remove('has-detail', 'has-third-panel');
            // Remove selected class from all blocks when returning to home
            document.querySelectorAll('.main-panel .block-unified').forEach(b => {
                b.classList.remove('selected');
            });
        } else {
            // Remove panels above the target level
            while (this.panelStack.length > level) {
                const removed = this.panelStack.pop();
                removed.panel.remove();
            }
        }
        
        this.currentLevel = level;
        
        // Update container classes based on remaining panels
        const hasThird = this.panelsContainer.querySelector('.third-panel') !== null;
        if (!hasThird) {
            this.panelsContainer.classList.remove('has-third-panel');
            if (this.currentLevel > 0) {
                this.panelsContainer.classList.add('has-detail');
            }
        }
        
        this.updatePanelsView();
        
        // Update breadcrumbs to match current level
        this.updateBreadcrumbsToLevel(level);
        
        if (updateHistory && level > 0) {
            const state = this.panelStack[level - 1];
            history.pushState({ level, url: state.url }, '', state.url);
        } else if (updateHistory && level === 0) {
            history.pushState({ level: 0, url: '/' }, '', '/');
            // Scroll panels container back to start
            this.panelsContainer.scrollLeft = 0;
        }
    }
    
    updateBreadcrumbs(url, panel) {
        if (!this.breadcrumbList) {
            console.error('Breadcrumb list not found, cannot update breadcrumbs');
            return;
        }
        
        // Get the title from the panel content
        const titleElement = panel.querySelector('h1, .content-header h1, h2, .block-title');
        const title = titleElement ? titleElement.textContent.trim() : 'Page';
        
        console.log('Updating breadcrumbs - Title:', title, 'Level:', this.currentLevel, 'URL:', url);
        
        // Remove breadcrumbs above current level first
        const existingItems = this.breadcrumbList.querySelectorAll('.breadcrumb-item');
        existingItems.forEach((item, index) => {
            if (index >= this.currentLevel) {
                item.remove();
            }
        });
        
        // Create new breadcrumb item
        const breadcrumbItem = document.createElement('li');
        breadcrumbItem.className = 'breadcrumb-item';
        breadcrumbItem.dataset.level = this.currentLevel;
        
        const breadcrumbLink = document.createElement('a');
        breadcrumbLink.href = url;
        breadcrumbLink.className = 'breadcrumb-link';
        breadcrumbLink.dataset.level = this.currentLevel;
        breadcrumbLink.textContent = title;
        
        breadcrumbItem.appendChild(breadcrumbLink);
        
        // Add new breadcrumb
        this.breadcrumbList.appendChild(breadcrumbItem);
        
        console.log('Breadcrumb added successfully');
    }
    
    updateBreadcrumbsToLevel(level) {
        // Remove breadcrumbs above the target level
        const existingItems = this.breadcrumbList.querySelectorAll('.breadcrumb-item');
        existingItems.forEach((item, index) => {
            if (index > level) {
                item.remove();
            }
        });
    }
    
    initializePanelContent(panel) {
        // Re-attach click handlers for new blocks
        const blocks = panel.querySelectorAll('.block');
        blocks.forEach(block => {
            block.addEventListener('click', (e) => {
                e.preventDefault();
                // Determine which panel this block is in
                const isFromMain = panel.classList.contains('main-panel');
                const isFromDetail = panel.classList.contains('detail-panel');
                this.navigateToUrl(block.dataset.url, isFromMain, isFromDetail);
            });
        });
        
        // Handle internal links in content
        const links = panel.querySelectorAll('a');
        links.forEach(link => {
            if (link.href && link.href.includes(window.location.origin)) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const url = new URL(link.href).pathname;
                    const isFromDetail = panel.classList.contains('detail-panel');
                    this.navigateToUrl(url, false, isFromDetail);
                });
            }
        });
    }
}

// Initialize navigation when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new CraftNavigation();
});
