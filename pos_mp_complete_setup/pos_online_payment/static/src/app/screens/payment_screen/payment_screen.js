import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        this._mercadoPagoConfirmHandler = this._onMercadoPagoConfirmed.bind(this);
        this.env.services.bus.addEventListener("confirm-paid", this._mercadoPagoConfirmHandler);
    },

    willUnmount() {
        this.env.services.bus.removeEventListener("confirm-paid", this._mercadoPagoConfirmHandler);
        super.willUnmount();
    },

    async _onMercadoPagoConfirmed(event) {
        const { ref } = event.detail;
        const currentOrder = this.currentOrder || this.env.pos.get_order();

        if (!currentOrder || currentOrder.name !== ref) {
            return;
        }

        if (this._autoValidating) {
            return;
        }

        this._autoValidating = true;
        try {
            await this.validateOrder(true);
        } catch (error) {
            console.error("[MercadoPago] Error al validar orden automáticamente", error);
        } finally {
            this._autoValidating = false;
        }
    },
});
