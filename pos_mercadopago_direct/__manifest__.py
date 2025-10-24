# -*- coding: utf-8 -*-
{
    "name": "POS Mercado Pago Direct",
    "summary": "Cobro directo con Mercado Pago en Punto de Venta (QR/Link)",
    "version": "19.0.1.0.0",
    "author": "Mezztt / Cesar Mezzabotta",
    "website": "https://mezztt.com",
    "license": "LGPL-3",
    "category": "Point of Sale",
    "depends": ["point_of_sale", "base"],
    "data": [
        "security/ir.model.access.csv",
        "views/res_config_settings_views.xml",
        "views/pos_payment_method_views.xml"
    ],
    "assets": {
        "point_of_sale.assets": [
            "pos_mercadopago_direct/static/src/js/mp_payment.js",
            "pos_mercadopago_direct/static/src/js/mp_qr_popup.js",
            "pos_mercadopago_direct/static/src/js/lib/simple_qr.js",
            "pos_mercadopago_direct/static/src/css/mp_payment.css",
            "pos_mercadopago_direct/static/src/xml/mp_payment.xml"
        ]
    },
    "images": ["static/description/icon.png"],
    "installable": True,
    "application": False
}