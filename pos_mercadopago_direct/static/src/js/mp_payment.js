/** @odoo-module */

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { MercadoPagoQRPopup } from "./mp_qr_popup";

const originalSetup = PaymentScreen.prototype.setup;

patch(PaymentScreen.prototype, {
    setup() {
        if (originalSetup) {
            originalSetup.apply(this, arguments);
        }
        this.dialogService = this.dialog || useService("dialog");
    },
    async _onClickMercadoPago() {
        try {
            const total = this.currentOrder.get_due();
            if (total <= 0) {
                return;
            }
            const result = await this.rpc({
                route: "/mp/pos/create",
                params: { amount: total, description: this.currentOrder.get_name(), external_reference: this.currentOrder.name },
            });
            if (result?.error) {
                registry.category("notification").add(result.error, { type: "danger" });
                return;
            }
            if (!result.qr_data) {
                registry.category("notification").add("No se pudo generar el código QR.", { type: "danger" });
                return;
            }
            let active = true;
            const popup = this.dialogService.add(MercadoPagoQRPopup, {
                title: "Mercado Pago",
                qrData: result.qr_data,
                amount: total,
                orderName: this.currentOrder.get_name(),
                onClose: () => {
                    active = false;
                },
            });
            if (!popup) {
                registry.category("notification").add("No se pudo abrir el QR de Mercado Pago.", { type: "danger" });
                return;
            }
            const started = Date.now();
            const check = async () => {
                if (!active) {
                    return;
                }
                const st = await this.rpc({
                    route: "/mp/pos/status",
                    params: {
                        order_id: result.in_store_order_id,
                        external_reference: result.external_reference,
                    },
                });
                if (st?.status === "approved") {
                    const pm = this.paymentMethods.find(x => x.mp_enabled);
                    if (!pm) {
                        registry.category("notification").add("Configure un método de pago 'Mercado Pago' en POS.", { type: "warning" });
                        return;
                    }
                    const amount = this.currentOrder.get_due();
                    this.currentOrder.add_paymentline(pm);
                    this.currentOrder.selected_paymentline.set_amount(amount);
                    await this._finalizeValidation();
                    if (popup?.close) {
                        popup.close();
                    }
                    registry.category("notification").add("Pago aprobado por Mercado Pago.", { type: "success" });
                    return;
                }
                if (Date.now() - started < 60000) {
                    setTimeout(check, 3000);
                } else {
                    registry.category("notification").add("Pago no confirmado aún. Revise en Mercado Pago.", { type: "warning" });
                    if (popup?.close) {
                        popup.close();
                    }
                }
            };
            setTimeout(check, 3000);
        } catch (e) {
            console.error(e);
            registry.category("notification").add("Error iniciando pago MP", { type: "danger" });
        }
    },
});
