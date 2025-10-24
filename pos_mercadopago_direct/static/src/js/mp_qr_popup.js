/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { registry } from "@web/core/registry";
import { useRef, onMounted } from "@odoo/owl";
import { renderQrToCanvas } from "./lib/simple_qr";

export class MercadoPagoQRPopup extends AbstractAwaitablePopup {
    setup() {
        super.setup();
        this.canvasRef = useRef("canvas");
        onMounted(() => {
            const canvas = this.canvasRef.el;
            if (canvas) {
                renderQrToCanvas(canvas, this.props.qrData, this.props.qrSize || 280);
            }
        });
    }

    close() {
        if (this.props.onClose) {
            this.props.onClose();
        }
        super.close();
    }
}

MercadoPagoQRPopup.template = "pos_mercadopago_direct.MercadoPagoQRPopup";
MercadoPagoQRPopup.defaultProps = {
    title: "Mercado Pago",
    qrSize: 280,
};

registry.category("pos_popups").add("MercadoPagoQRPopup", MercadoPagoQRPopup);

