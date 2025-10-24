# -*- coding: utf-8 -*-
from odoo import models, fields

class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    mp_enabled = fields.Boolean(string="Mercado Pago (Directo)")
