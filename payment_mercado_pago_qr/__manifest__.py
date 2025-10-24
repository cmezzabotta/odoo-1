{
    'name': 'Mercado Pago QR Payment',
    'version': '1.0.0',
    'summary': 'Accept payments through Mercado Pago QR codes.',
    'description': 'Adds a Mercado Pago QR payment provider that generates scannable QR codes during checkout.',
    'category': 'Accounting/Payment Providers',
    'author': 'OpenAI Assistant',
    'website': 'https://www.mercadopago.com',
    'license': 'LGPL-3',
    'depends': ['payment', 'website_sale'],
    'data': [
        'data/payment_provider_data.xml',
        'views/payment_provider_views.xml',
        'views/payment_templates.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'payment_mercado_pago_qr/static/src/js/mercado_pago_qr_form.js',
        ],
    },
    'installable': True,
    'application': True,
}
