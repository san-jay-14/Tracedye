CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- "salt:hash", scrypt, hex
  plan          TEXT NOT NULL,
  events_30d    INTEGER NOT NULL
);

-- Password for this user is "demo-password".
INSERT INTO users (email, password_hash, plan, events_30d) VALUES (
  'demo@example.com',
  'd93356a8f4c2dbf36ec12d6af08531c9:b1bb4b7bc6ecdcc653b4174446ae9eca1c803b95bfe1f489edf5762720717c5f364ad1ea13913395c67eb84f648bdfecdd20f41ac0e1a4cc1a208bc32ed3f570',
  'pro',
  412
);
