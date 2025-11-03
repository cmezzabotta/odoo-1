import { Component, onWillUnmount } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

export class OnlinePaymentPopup extends Component {
    static template = "pos_online_payment.OnlinePaymentPopup";
    static components = { Dialog };
    static props = {
        qrCode: String,
        formattedAmount: String,
        orderName: String,
        orderTotal: Number,
        close: Function,
    };

    setup() {
        super.setup();
        this._isPolling = false;
        this._pollingTimeout = null;

        onWillUnmount(() => this._stopPolling());
    }

    mounted() {
        super.mounted();
        const ref = this.props.orderName;
        const amount = Number(this.props.orderTotal);

        // Crear orden en backend
        fetch("/pos/create_mercadopago_order", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                reference: ref,
                amount: amount,
            }),
        })
        .then((res) => res.json())
        .then((data) => {
            if (data.error) {
                console.error("Error al crear orden:", data.error);
                this.showError("Error al crear orden en Mercado Pago.");
            } else {
                this.startPolling(ref);
            }
        })
        .catch((err) => {
            console.error("Error al llamar backend:", err);
            this.showError("Fallo de comunicación.");
        });
    }

    async startPolling(ref) {
        this._stopPolling();
        this._isPolling = true;
        const poll = async () => {
            if (!this._isPolling) {
                return;
            }
            try {
                const res = await fetch(`/pos/mercado_pago_status/${ref}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                const data = await res.json();
                if (data.paid) {
                    this._stopPolling();
                    if (this.props.close) {
                        this.props.close();
                    }
                    this.env.services.bus.trigger("confirm-paid", { ref, amount: this.props.orderTotal });
                } else {
                    this._pollingTimeout = setTimeout(poll, 3000);
                }
            } catch (err) {
                console.error("Polling error:", err);
                this._pollingTimeout = setTimeout(poll, 5000);
            }
        };
        poll();
    }

    showError(message) {
        this._stopPolling();
        alert(message);
    }

    _stopPolling() {
        this._isPolling = false;
        if (this._pollingTimeout) {
            clearTimeout(this._pollingTimeout);
            this._pollingTimeout = null;
        }
    }
}