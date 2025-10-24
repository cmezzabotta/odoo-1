odoo.define('payment_mercado_pago_qr.qr_form', function (require) {
    'use strict';

    const ajax = require('web.ajax');
    const publicWidget = require('web.public.widget');

    publicWidget.registry.MercadoPagoQRPayment = publicWidget.Widget.extend({
        selector: '.o_mercado_pago_qr_panel',
        pollingInterval: 5000,

        start() {
            this._renderFallbackQRCode();
            this._startPolling();
            return this._super(...arguments);
        },

        _renderFallbackQRCode() {
            const canvasContainer = this.el.querySelector('.o_mercado_pago_qr_canvas');
            if (!canvasContainer) {
                return;
            }
            const qrData = canvasContainer.dataset.qr;
            if (!qrData) {
                return;
            }
            const img = document.createElement('img');
            img.alt = 'Mercado Pago QR';
            img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(qrData);
            canvasContainer.appendChild(img);
        },

        _startPolling() {
            const statusUrl = this.el.dataset.statusUrl;
            if (!statusUrl) {
                return;
            }
            this._polling = window.setInterval(() => this._pollStatus(statusUrl), this.pollingInterval);
        },

        async _pollStatus(statusUrl) {
            try {
                const response = await ajax.jsonRpc(statusUrl, 'call', {});
                if (!response) {
                    return;
                }
                if (response.state === 'done') {
                    this._updateStatus('Pago acreditado correctamente.');
                    window.clearInterval(this._polling);
                    window.location.reload();
                } else if (response.state === 'cancel') {
                    this._updateStatus('El pago fue rechazado o cancelado.');
                    window.clearInterval(this._polling);
                } else {
                    this._updateStatus('Esperando confirmación de Mercado Pago...');
                }
            } catch (error) {
                // Silent retry to avoid blocking the payment flow.
                console.warn('Mercado Pago QR polling error', error);
            }
        },

        _updateStatus(message) {
            const statusEl = this.el.querySelector('.o_mercado_pago_qr_status');
            if (!statusEl) {
                return;
            }
            statusEl.textContent = message;
        },

        destroy() {
            if (this._polling) {
                window.clearInterval(this._polling);
            }
            return this._super(...arguments);
        },
    });

    return publicWidget.registry.MercadoPagoQRPayment;
});
