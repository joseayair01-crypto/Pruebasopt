(function modalScrollLockBootstrap() {
    let scrollTop = 0;
    let isLocked = false;

    const scrollableSelector = '.modal-content, .modal-contacto, .modal-contenido-orden-confirmada, .orden-modal-content, .modal-carrito, .modal-carrito-body';
    const modalSelector = '.modal, .modal-overlay, .modal-carrito-overlay, #modalOrdenConfirmada, #modalLoadingOrden';

    function isVisibleModal(element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }
        if (element.classList.contains('show') || element.classList.contains('active')) {
            return true;
        }
        return style.display !== 'none';
    }

    function hasOpenModal() {
        return Array.from(document.querySelectorAll(modalSelector)).some(isVisibleModal);
    }

    function lockBodyScroll() {
        if (isLocked) return;
        scrollTop = window.scrollY || window.pageYOffset || 0;
        document.body.classList.add('modal-scroll-locked');
        document.body.style.top = `-${scrollTop}px`;
        isLocked = true;
    }

    function unlockBodyScroll() {
        if (!isLocked) return;
        document.body.classList.remove('modal-scroll-locked');
        document.body.style.top = '';
        window.scrollTo(0, scrollTop);
        isLocked = false;
    }

    function syncModalScrollLock() {
        if (hasOpenModal()) {
            lockBodyScroll();
        } else {
            unlockBodyScroll();
        }
    }

    function handleTouchMove(event) {
        if (!isLocked) return;
        const scrollableParent = event.target instanceof Element
            ? event.target.closest(scrollableSelector)
            : null;

        if (!scrollableParent) {
            event.preventDefault();
        }
    }

    function init() {
        const observer = new MutationObserver(() => {
            window.requestAnimationFrame(syncModalScrollLock);
        });

        observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('pageshow', syncModalScrollLock);
        document.addEventListener('visibilitychange', syncModalScrollLock);
        syncModalScrollLock();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.rifaplusModalScrollLock = {
        sync: syncModalScrollLock,
        lock: lockBodyScroll,
        unlock: unlockBodyScroll
    };
})();
