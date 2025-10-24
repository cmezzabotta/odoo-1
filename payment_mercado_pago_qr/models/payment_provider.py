# -*- coding: utf-8 -*-
"""Payment provider definition for Mercado Pago QR."""

import logging

from odoo import _, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class PaymentProviderMercadoPago(models.Model):
    """Extend :model:`payment.provider` with Mercado Pago QR specific fields."""

    _inherit = 'payment.provider'

    code = fields.Selection(  # type: ignore[assignment]
        selection_add=[('mercado_pago_qr', 'Mercado Pago QR')],
        ondelete={'mercado_pago_qr': 'set default'},
    )
    mercado_pago_access_token = fields.Char(
        string='Mercado Pago Access Token',
        help="Access token generated from Mercado Pago's developer portal.",
    )
    mercado_pago_collector_id = fields.Char(
        string='Collector ID',
        help="Numeric account identifier used in QR order URLs.",
    )
    mercado_pago_store_id = fields.Char(
        string='Store ID',
        help='Identifier of the store that will receive the QR payments.',
    )
    mercado_pago_pos_id = fields.Char(
        string='Point of Sale ID',
        help='Identifier of the physical point of sale where the QR is registered.',
    )
    mercado_pago_notification_url = fields.Char(
        string='Notification URL',
        help='Optional URL that Mercado Pago will call when the QR order status changes.',
    )
    mercado_pago_sandbox_mode = fields.Boolean(
        string='Use Sandbox Environment',
        help='Enable sandbox API endpoints for testing purposes.',
    )
    mercado_pago_timeout = fields.Integer(
        string='Request Timeout (seconds)',
        default=60,
        help='Maximum number of seconds to wait for Mercado Pago API responses.',
    )

    def _get_supported_payment_method_codes(self):
        """Register the offline QR payment method."""
        supported_codes = super()._get_supported_payment_method_codes()
        supported_codes['mercado_pago_qr'] = ['mercado_pago_qr']
        return supported_codes

    def _get_feature_support(self):
        """Declare supported features for the Mercado Pago QR provider."""
        res = super()._get_feature_support()
        res['mercado_pago_qr'] = {
            'fees': False,
            'manage_token': False,
            'refunds': True,
            'partial_refunds': False,
            'authorize': False,
            'save_card': False,
            'tokenize': False,
            'manual_capture': False,
            'capture_manually': False,
        }
        return res

    def _get_default_payment_method_id(self):
        """Return the default payment method for Mercado Pago QR."""
        self.ensure_one()
        if self.code == 'mercado_pago_qr':
            return self.env.ref('payment_mercado_pago_qr.payment_method_mercado_pago_qr').id
        return super()._get_default_payment_method_id()

    def _mercado_pago_get_api_url(self):
        """Return the base API URL depending on the sandbox flag."""
        self.ensure_one()
        if self.mercado_pago_sandbox_mode:
            return 'https://api.mercadopago.com'
        return 'https://api.mercadopago.com'

    def _mercado_pago_validate_configuration(self):
        """Ensure all required credentials are provided before processing."""
        for provider in self.filtered(lambda p: p.code == 'mercado_pago_qr'):
            missing = [
                field_name
                for field_name in (
                    'mercado_pago_access_token',
                    'mercado_pago_collector_id',
                    'mercado_pago_store_id',
                    'mercado_pago_pos_id',
                )
                if not provider[field_name]
            ]
            if missing:
                raise ValidationError(
                    _(
                        'The Mercado Pago QR provider is not fully configured. '
                        'Please define the following fields: %s'
                    )
                    % ', '.join(missing)
                )
        return True

    def write(self, vals):
        """Validate configuration whenever the provider is activated."""
        res = super().write(vals)
        for provider in self:
            if provider.code == 'mercado_pago_qr' and provider.state == 'enabled':
                try:
                    provider._mercado_pago_validate_configuration()
                except ValidationError as exc:
                    _logger.warning('Mercado Pago QR configuration error: %s', exc)
                    raise
        return res
