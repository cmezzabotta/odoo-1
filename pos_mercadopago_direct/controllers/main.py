# -*- coding: utf-8 -*-
import logging
import requests
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

class MPPOSController(http.Controller):
    def _mp_headers(self):
        icp = request.env["ir.config_parameter"].sudo()
        token = icp.get_param("pos_mercadopago_direct.access_token")
        if not token:
            return None
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    @http.route("/mp/pos/create", type="json", auth="user")
    def mp_pos_create(self, amount, description="POS Order", external_reference=None):
        headers = self._mp_headers()
        if not headers:
            return {"error": "Falta Access Token en Ajustes."}
        icp = request.env["ir.config_parameter"].sudo()
        collector_id = (icp.get_param("pos_mercadopago_direct.collector_id") or "").strip()
        external_pos_id = (icp.get_param("pos_mercadopago_direct.external_pos_id") or "").strip()
        if not collector_id or not external_pos_id:
            return {"error": "Configure Collector ID y POS ID de Mercado Pago."}
        total = round(float(amount), 2)
        if total <= 0:
            return {"error": "El monto debe ser mayor a cero."}
        reference = external_reference or "pos-order"
        body = {
            "external_reference": reference,
            "title": description or "POS Order",
            "description": description or "POS Order",
            "total_amount": total,
            "items": [{
                "sku_number": reference,
                "category": "others",
                "title": description or "POS Order",
                "description": description or "POS Order",
                "unit_price": total,
                "quantity": 1,
                "unit_measure": "unit",
                "total_amount": total,
            }],
        }
        base_url = "https://api.mercadopago.com"
        url = f"{base_url}/instore/orders/qr/seller/collectors/{collector_id}/pos/{external_pos_id}/qrs"
        try:
            resp = requests.post(url, headers=headers, json=body, timeout=20)
            data = resp.json()
            if resp.status_code >= 300:
                _logger.error("MP create preference error %s: %s", resp.status_code, data)
                return {"error": data.get("message") or "Error generando QR"}
            qr_data = data.get("qr_data")
            if not qr_data:
                _logger.error("MP QR sin qr_data: %s", data)
                return {"error": "Respuesta inválida de Mercado Pago"}
            return {
                "qr_data": qr_data,
                "in_store_order_id": data.get("in_store_order_id"),
                "external_reference": reference,
            }
        except Exception as e:
            _logger.exception("MP create preference exception")
            return {"error": str(e)}

    @http.route("/mp/pos/status", type="json", auth="user")
    def mp_pos_status(self, order_id=None, external_reference=None):
        headers = self._mp_headers()
        if not headers:
            return {"error": "Falta Access Token en Ajustes."}
        try:
            base_url = "https://api.mercadopago.com"

            if order_id:
                url = f"{base_url}/merchant_orders/{order_id}"
                resp = requests.get(url, headers=headers, timeout=20)
                data = resp.json()
                if resp.status_code < 300:
                    return self._parse_status_response(data)
                if resp.status_code != 404:
                    _logger.error("MP status error %s: %s", resp.status_code, data)
                    return {"error": data.get("message") or "Error consultando estado"}

            if not external_reference:
                return {"status": "pending"}

            url = f"{base_url}/merchant_orders/search?external_reference={external_reference}"
            resp = requests.get(url, headers=headers, timeout=20)
            data = resp.json()
            if resp.status_code >= 300:
                _logger.error("MP status error %s: %s", resp.status_code, data)
                return {"error": data.get("message") or "Error consultando estado"}
            results = data.get("elements") or []
            if not results:
                return {"status": "pending"}
            return self._parse_status_response(results[0])
        except Exception as e:
            _logger.exception("MP status exception")
            return {"error": str(e)}

    def _parse_status_response(self, merchant_order):
        payments = merchant_order.get("payments") or []
        for payment in payments:
            if payment.get("status") == "approved":
                return {
                    "status": "approved",
                    "transaction_amount": payment.get("transaction_amount"),
                    "payment_id": payment.get("id"),
                }
        if payments:
            return {"status": payments[0].get("status")}
        if merchant_order.get("order_status") == "delivered":
            return {"status": "approved"}
        return {"status": merchant_order.get("order_status") or "pending"}
