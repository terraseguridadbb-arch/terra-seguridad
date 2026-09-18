# PROPUESTA (no implementada): tomar la IP del visitante del lado servidor

Estado: PROPUESTA. Nada de esto esta implementado ni desplegado. Requiere una
decision humana. NEXT-SEC-15 solo retiro la consulta del navegador a un servicio
externo de lookup de IP; no traslado esa captura a ningun otro lado.

## Por que aparece el tema

El unico uso real que tenia la IP era alimentar `client_ip_address` en el evento
que la automatizacion envia a Meta (Conversions API). Meta lo usa como una de las
senales de calidad de coincidencia (EMQ). Que retirarla baje el EMQ es una
INFERENCE: no esta medido en esta cuenta, y ninguna de las pruebas locales puede
medirlo. Lo que si esta verificado por lectura del codigo de la automatizacion es
que el campo es opcional: si no viene, el payload se arma igual y el evento se
envia igual.

## Si la Direccion decidiera capturarla

Proposito declarado: unicamente mejorar la coincidencia del evento de conversion
en Meta. No sirve para identificar al visitante en el CRM ni para segmentar.

Fuente confiable: la IP de origen que ve el borde de la plataforma de hosting
(cabecera `x-forwarded-for` en una Serverless Function o Edge Function propia, o
la que recibe el webhook de la automatizacion). No la que dice el navegador: eso
es dato del cliente y se puede falsear.

Detalles que hay que resolver ANTES de proponerla como decision:

1. Cadena de proxies: `x-forwarded-for` puede traer varias direcciones. Hay que
   fijar cual se toma (la primera confiable segun el proveedor) y no la primera
   a secas, que es falsificable por quien hace el pedido.
2. Doble salto: hoy el envio pasa por el navegador y despues por la
   automatizacion alojada en otro proveedor. Si la IP la toma la automatizacion,
   la IP que ve es la del visitante solo si el pedido sale del navegador, no si
   lo reenvia otro sistema.
3. Retencion: DATOS_FALTANTES. Hay que decidir si se guarda (y cuanto) o si se
   usa en transito y no se persiste en ningun log ni en el CRM. Hoy no hay un
   plazo decidido ni un lugar declarado donde guardarla.
4. Aviso: si se captura, el texto publico tiene que decirlo antes de que ocurra.
5. Base para tratarla: DATO_A_COMPLETAR_POR_DIRECCION. Este documento no afirma
   que exista ni que falte una base legal: no es una evaluacion juridica.

## Alternativa que no requiere capturar nada

Mantener el estado actual (sin IP) y medir en Meta si el EMQ del evento cambia.
Si no cambia de forma relevante, el tema se cierra sin capturar ningun dato mas.
Esa medicion exige acceso a la cuenta de Meta: queda fuera de este paquete.

## Efecto externo

EFECTO_EXTERNO_PENDIENTE: publicar el sitio sin el lookup es un despliegue, y el
despliegue es decision de Berenise. Implementar esta propuesta seria ademas
codigo nuevo del lado servidor, que hoy no existe.
