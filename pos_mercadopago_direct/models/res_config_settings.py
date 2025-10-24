# -*- coding: utf-8 -*-
from odoo import models, fields

class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    mp_access_token = fields.Char(string="Mercado Pago Access Token", config_parameter="pos_mercadopago_direct.access_token")
    mp_public_key = fields.Char(string="Mercado Pago Public Key", config_parameter="pos_mercadopago_direct.public_key")
    mp_sandbox = fields.Boolean(string="Usar Sandbox", config_parameter="pos_mercadopago_direct.sandbox", default=True)
    mp_collector_id = fields.Char(
        string="Mercado Pago Collector ID",
        config_parameter="pos_mercadopago_direct.collector_id",
        help="Identificador del cobrador utilizado para generar órdenes QR."
    )
    mp_external_pos_id = fields.Char(
        string="Mercado Pago POS ID",
        config_parameter="pos_mercadopago_direct.external_pos_id",
        help="ID del punto de venta configurado en Mercado Pago (external POS ID)."
    )
