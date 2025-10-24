# -*- coding: utf-8 -*-
"""Mercado Pago QR transaction helpers."""

import json
import logging
from datetime import timedelta

import requests

from odoo import _, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    """Extend :model:`payment.transaction` with Mercado Pago QR logic."""

    _inherit = 'payment.transaction'

    mercado_pago_qr_data = fields.Char(copy=False)
    mercado_pago_qr_image = fields.Text(copy=False)
    mercado_pago_qr_expires_at = fields.Datetime(copy=False)
    mercado_pago_qr_order_id = fields.Char(copy=False)

    def _get_specific_rendering_values(self, processing_values):
        """Generate the data required by the Mercado Pago QR template."""
        res = super()._get_specific_rendering_values(processing_values)
        if self.provider_code != 'mercado_pago_qr':
            return res

        self.ensure_one()
        provider = self.provider_id
        provider._mercado_pago_validate_configuration()

        if not self.mercado_pago_qr_data or self._mercado_pago_qr_expired():
            qr_response = self._mercado_pago_qr_create_order()
            self.write({
                'mercado_pago_qr_data': qr_response.get('qr_data'),
                'mercado_pago_qr_image': qr_response.get('qr_image'),
                'mercado_pago_qr_order_id': qr_response.get('in_store_order_id'),
                'mercado_pago_qr_expires_at': fields.Datetime.now() + timedelta(minutes=15),
            })

        return {
            'api_url': '/payment/mercado-pago-qr/status/%s' % self.id,
            'provider_code': 'mercado_pago_qr',
            'mercado_pago_qr_data': self.mercado_pago_qr_data,
            'mercado_pago_qr_image': self.mercado_pago_qr_image,
            'mercado_pago_qr_order_id': self.mercado_pago_qr_order_id,
            'reference': self.reference,
            'amount': self.amount,
            'currency': self.currency_id.name,
        }

    def _mercado_pago_qr_expired(self):
        self.ensure_one()
        if not self.mercado_pago_qr_expires_at:
            return True
        return fields.Datetime.now() >= self.mercado_pago_qr_expires_at

    def _mercado_pago_make_request(self, method, endpoint, provider=None, payload=None, params=None):
        self.ensure_one()
        provider = provider or self.provider_id
        base_url = provider._mercado_pago_get_api_url()
        url = '%s%s' % (base_url, endpoint)
        headers = {
            'Authorization': 'Bearer %s' % provider.mercado_pago_access_token,
            'Content-Type': 'application/json',
        }
        timeout = provider.mercado_pago_timeout or 60
        response = requests.request(
            method,
            url,
            data=json.dumps(payload) if payload else None,
            params=params,
            headers=headers,
            timeout=timeout,
        )
        if response.status_code >= 400:
            _logger.error(
                'Mercado Pago API error for transaction %s: %s',
                self.reference,
                response.text,
            )
            raise ValidationError(
                _(
                    'Mercado Pago QR returned an error while processing the payment (%s). '
                    'Please review the provider configuration.'
                )
                % response.status_code
            )
        if not response.text:
            return {}
        return response.json()

    def _mercado_pago_qr_create_order(self):
        """Create an order in Mercado Pago and retrieve the QR data."""
        self.ensure_one()
        provider = self.provider_id
        payload = {
            'external_reference': self.reference,
            'notification_url': provider.mercado_pago_notification_url,
            'title': self.reference,
            'total_amount': float(self.amount),
            'items': [
                {
                    'title': self.reference,
                    'description': self.reference,
                    'quantity': 1,
                    'unit_price': float(self.amount),
                }
            ],
        }
        endpoint = (
            '/instore/orders/qr/seller/collectors/{collector}/stores/{store}/pos/{pos}/qrs'
        ).format(
            collector=provider.mercado_pago_collector_id,
            store=provider.mercado_pago_store_id,
            pos=provider.mercado_pago_pos_id,
        )
        response = self._mercado_pago_make_request('POST', endpoint, payload=payload)
        qr_data = response.get('qr_data')
        if not qr_data:
            raise ValidationError(
                _('Mercado Pago did not return a QR code for transaction %s.') % self.reference
            )
        return response

    def _mercado_pago_qr_refresh_status(self):
        """Query Mercado Pago for the latest payment status."""
        self.ensure_one()
        provider = self.provider_id
        params = {
            'external_reference': self.reference,
            'sort': 'date_created',
            'criteria': 'desc',
        }
        endpoint = '/merchant_orders/search'
        response = self._mercado_pago_make_request('GET', endpoint, params=params)
        results = response.get('elements') or []
        if not results:
            return False
        order = results[0]
        payments = order.get('payments') or []
        if any(payment.get('status') == 'approved' for payment in payments):
            self._set_done()
            return True
        if any(payment.get('status') == 'rejected' for payment in payments):
            self._set_canceled()
            return True
        return False

    def _process_notification_data(self, notification_data):
        """Handle Mercado Pago webhook notifications."""
        super()._process_notification_data(notification_data)
        if self.provider_code != 'mercado_pago_qr':
            return
        topic = notification_data.get('type') or notification_data.get('topic')
        if topic not in {'merchant_order', 'payment'}:
            return
        self._mercado_pago_qr_refresh_status()

