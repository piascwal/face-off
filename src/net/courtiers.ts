/**
 * Les origines des serveurs de découverte (MQTT sur WebSocket chiffré) que la
 * politique de sécurité du contenu du site publié autorise (voir
 * vite.config.ts). Cette liste est lue par la configuration de Vite, qui ne
 * peut pas charger le TypeScript de lan-kit ; un test (tests/csp.test.ts)
 * vérifie qu'elle reste identique à celle de lan-kit.
 */
export const ORIGINES_COURTIERS = [
  'wss://broker.emqx.io:8084',
  'wss://broker.hivemq.com:8884',
  'wss://test.mosquitto.org:8081',
];
