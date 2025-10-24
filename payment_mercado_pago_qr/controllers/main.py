# -*- coding: utf-8 -*-
"""Controllers for Mercado Pago QR payment flow."""

from odoo import http
from odoo.http import request


class MercadoPagoQRController(http.Controller):
    """Expose endpoints used to poll transaction status."""

    @http.route(
        '/payment/mercado-pago-qr/status/<int:transaction_id>',
        type='json',
        auth='public',
        csrf=False,
    )
    def mercado_pago_qr_status(self, transaction_id):
        transaction = request.env['payment.transaction'].sudo().browse(transaction_id)
        if not transaction or transaction.provider_code != 'mercado_pago_qr':
            return {'state': 'not_found'}
        transaction._mercado_pago_qr_refresh_status()
        return {
            'state': transaction.state,
            'state_message': transaction.state_message,
        }
