/**
 * PixelFilter — retro pixelation post-process effect.
 * Downscales the canvas to a small offscreen buffer then draws it back
 * stretched with nearest-neighbour sampling to produce chunky pixels.
 */
class PixelFilter {
    constructor() {
        this._enabled = true;
        this._pixelWidth = 5;
        this._pixelHeight = 5;
        this._smoothing = false;
        this._offscreen = null;
        this._offCtx = null;
    }

    get enabled() { return this._enabled; }
    set enabled(v) { this._enabled = !!v; }

    get pixelWidth() { return this._pixelWidth; }
    set pixelWidth(v) {
        this._pixelWidth = Math.max(1, Math.round(v));
        this._offscreen = null;
    }

    get pixelHeight() { return this._pixelHeight; }
    set pixelHeight(v) {
        this._pixelHeight = Math.max(1, Math.round(v));
        this._offscreen = null;
    }

    get pixelSize() { return this._pixelWidth; }
    set pixelSize(v) {
        const s = Math.max(1, Math.round(v));
        this._pixelWidth = s;
        this._pixelHeight = s;
        this._offscreen = null;
    }

    get smoothing() { return this._smoothing; }
    set smoothing(v) { this._smoothing = !!v; }

    apply(canvas, ctx) {
        if (!this._enabled) return;

        const w = canvas.width;
        const h = canvas.height;
        const sw = Math.round(w / this._pixelWidth);
        const sh = Math.round(h / this._pixelHeight);

        // Lazy-create offscreen canvas at the reduced size
        if (!this._offscreen || this._offscreen.width !== sw || this._offscreen.height !== sh) {
            this._offscreen = document.createElement('canvas');
            this._offscreen.width = sw;
            this._offscreen.height = sh;
            this._offCtx = this._offscreen.getContext('2d');
        }

        // Downscale: draw full canvas into tiny buffer (bilinear by default)
        this._offCtx.drawImage(canvas, 0, 0, sw, sh);

        // Upscale: draw tiny buffer back onto main canvas
        ctx.save();
        ctx.imageSmoothingEnabled = this._smoothing;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this._offscreen, 0, 0, w, h);
        ctx.restore();
    }
}

export const pixelFilter = new PixelFilter();
