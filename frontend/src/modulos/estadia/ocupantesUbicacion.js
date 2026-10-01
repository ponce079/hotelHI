// Catálogo inicial: Argentina y sus cinco países limítrofes.
// Localidades sugeridas, no un padrón exhaustivo. El formulario permite otra localidad.
export const PAISES_OCUPANTES = [
  { codigo: 'AR', nombre: 'Argentina', localidades: ['Ciudad Autónoma de Buenos Aires', 'La Plata', 'Mar del Plata', 'Bahía Blanca', 'Córdoba', 'Rosario', 'Santa Fe', 'Mendoza', 'San Miguel de Tucumán', 'Salta', 'San Salvador de Jujuy', 'Posadas', 'Resistencia', 'Corrientes', 'Paraná', 'Neuquén', 'San Carlos de Bariloche', 'Comodoro Rivadavia', 'Río Gallegos', 'Ushuaia', 'San Juan', 'San Luis', 'Santiago del Estero', 'Formosa', 'La Rioja', 'San Fernando del Valle de Catamarca', 'Santa Rosa', 'Rawson', 'Viedma'] },
  { codigo: 'BR', nombre: 'Brasil', localidades: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Belo Horizonte', 'Porto Alegre', 'Curitiba', 'Florianópolis', 'Foz do Iguaçu', 'Salvador', 'Recife', 'Fortaleza', 'Manaus', 'Belém', 'Goiânia', 'Campinas'] },
  { codigo: 'CL', nombre: 'Chile', localidades: ['Santiago', 'Valparaíso', 'Viña del Mar', 'Concepción', 'La Serena', 'Antofagasta', 'Iquique', 'Arica', 'Temuco', 'Valdivia', 'Puerto Montt', 'Punta Arenas', 'Talca', 'Rancagua', 'Chillán'] },
  { codigo: 'UY', nombre: 'Uruguay', localidades: ['Montevideo', 'Punta del Este', 'Maldonado', 'Colonia del Sacramento', 'Salto', 'Paysandú', 'Rivera', 'Tacuarembó', 'Melo', 'Mercedes', 'Rocha', 'Minas', 'Durazno', 'Florida', 'Canelones'] },
  { codigo: 'PY', nombre: 'Paraguay', localidades: ['Asunción', 'Ciudad del Este', 'Encarnación', 'Luque', 'San Lorenzo', 'Lambaré', 'Fernando de la Mora', 'Capiatá', 'Limpio', 'Mariano Roque Alonso', 'Pedro Juan Caballero', 'Concepción', 'Villarrica', 'Caaguazú', 'Pilar'] },
  { codigo: 'BO', nombre: 'Bolivia', localidades: ['La Paz', 'Santa Cruz de la Sierra', 'Cochabamba', 'Sucre', 'Oruro', 'Potosí', 'Tarija', 'Trinidad', 'Cobija', 'El Alto', 'Montero', 'Quillacollo', 'Sacaba', 'Yacuiba', 'Villazón'] },
];

const clave = valor => String(valor || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

// Reconoce nombres históricos sin reescribir la identidad guardada del ocupante.
export function buscarPaisOcupante(valor) {
  return PAISES_OCUPANTES.find(p => clave(p.codigo) === clave(valor) || clave(p.nombre) === clave(valor));
}
