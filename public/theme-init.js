// Sayfa çizilmeden önce kullanıcının tema seçimini uygula (açılışta yanıp sönmeyi önler).
(function () {
    try {
        var t = JSON.parse(localStorage.getItem('pubskor:v8:theme') || '"system"');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    } catch (e) { /* yok say */ }
})();
