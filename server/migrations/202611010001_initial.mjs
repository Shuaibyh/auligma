export async function up(db) {
  await db.raw(`
    CREATE TABLE users (
      id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)),
      role text NOT NULL CHECK (role IN ('docente','estudiante')),
      active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id, role)
    );
    CREATE TABLE external_identities (
      id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id),
      provider text NOT NULL CHECK(provider = 'google'), subject text NOT NULL,
      hosted_domain text, UNIQUE(provider, subject)
    );
    CREATE TABLE professional_schools (id smallint PRIMARY KEY, name text NOT NULL UNIQUE);
    INSERT INTO professional_schools VALUES (1,'Derecho'),(2,'Contabilidad'),(3,'Administración'),
      (4,'Ingeniería de Sistemas'),(5,'Agronomía'),(6,'Administración en Turismo y Hotelería');
    CREATE TABLE student_profiles (
      user_id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'estudiante' CHECK(role='estudiante'),
      first_names varchar(80) NOT NULL DEFAULT '', last_names varchar(80) NOT NULL DEFAULT '',
      phone varchar(20) NOT NULL DEFAULT '', photo text, university_code text UNIQUE,
      school_id smallint REFERENCES professional_schools(id),
      FOREIGN KEY(user_id,role) REFERENCES users(id,role)
    );
    CREATE TABLE teacher_profiles (
      user_id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'docente' CHECK(role='docente'),
      first_names varchar(80) NOT NULL DEFAULT '', last_names varchar(80) NOT NULL DEFAULT '',
      phone varchar(20) NOT NULL DEFAULT '', photo text, professional_info varchar(240) NOT NULL DEFAULT '',
      FOREIGN KEY(user_id,role) REFERENCES users(id,role)
    );
    CREATE TABLE teacher_authorizations (
      id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK(email=lower(email)), google_sub text UNIQUE,
      kind text NOT NULL CHECK(kind IN ('institutional','pilot')), approved boolean NOT NULL DEFAULT true,
      evidence text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
    );
    CREATE TABLE subjects (
      id uuid PRIMARY KEY, teacher_id uuid NOT NULL REFERENCES teacher_profiles(user_id),
      name varchar(160) NOT NULL CHECK(length(trim(name)) > 0), archived_at timestamptz,
      UNIQUE(teacher_id,name), UNIQUE(id,teacher_id)
    );
    CREATE TABLE classrooms (
      id uuid PRIMARY KEY, subject_id uuid NOT NULL, teacher_id uuid NOT NULL,
      section varchar(30) NOT NULL, period varchar(30) NOT NULL, shift varchar(30) NOT NULL,
      private boolean NOT NULL DEFAULT true CHECK(private), archived_at timestamptz,
      FOREIGN KEY(subject_id,teacher_id) REFERENCES subjects(id,teacher_id), UNIQUE(subject_id,section,period)
    );
    CREATE INDEX classrooms_teacher_idx ON classrooms(teacher_id,archived_at);
    CREATE TABLE enrollments (
      id uuid PRIMARY KEY, classroom_id uuid NOT NULL REFERENCES classrooms(id),
      student_user_id uuid REFERENCES student_profiles(user_id),
      institutional_email text NOT NULL CHECK(institutional_email=lower(institutional_email) AND institutional_email LIKE '%@undc.edu.pe'),
      status text NOT NULL CHECK(status IN ('preauthorized','active','revoked','pending_review')),
      created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
      CHECK(status <> 'active' OR student_user_id IS NOT NULL),
      UNIQUE(classroom_id,institutional_email), UNIQUE(classroom_id,student_user_id)
    );
    CREATE INDEX enrollments_student_idx ON enrollments(student_user_id,status);
    CREATE TABLE sessions (
      token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), csrf_token text NOT NULL,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
    CREATE INDEX sessions_user_idx ON sessions(user_id);
    CREATE TABLE oauth_attempts (
      state_hash text PRIMARY KEY, browser_hash text NOT NULL, nonce text NOT NULL,
      verifier text NOT NULL, expires_at timestamptz NOT NULL
    );
    CREATE INDEX oauth_expiry_idx ON oauth_attempts(expires_at);
    CREATE TABLE audit_events (
      id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL,
      resource_id uuid, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_actor_date_idx ON audit_events(actor_id,created_at);
  `);
}
export async function down() {
  throw new Error('Reversión destructiva deshabilitada: prepara una migración correctiva y un respaldo.');
}
