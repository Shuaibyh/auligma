export async function up(db) {
  await db.raw(`
    ALTER TABLE enrollments
      ADD COLUMN authorized_by uuid REFERENCES teacher_profiles(user_id),
      ADD COLUMN authorized_at timestamptz,
      ADD COLUMN linked_at timestamptz,
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

    UPDATE enrollments e
      SET authorized_by = c.teacher_id,
          authorized_at = e.created_at,
          linked_at = CASE WHEN e.status = 'active' THEN e.created_at ELSE NULL END,
          revoked_at = CASE WHEN e.status = 'revoked' THEN COALESCE(e.revoked_at, e.created_at) ELSE NULL END
      FROM classrooms c
      WHERE c.id = e.classroom_id;

    ALTER TABLE enrollments
      ALTER COLUMN authorized_by SET NOT NULL,
      ALTER COLUMN authorized_at SET NOT NULL,
      ADD CONSTRAINT enrollments_revocation_consistency
        CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
      ADD CONSTRAINT enrollments_link_consistency
        CHECK (status <> 'active' OR (student_user_id IS NOT NULL AND linked_at IS NOT NULL));

    CREATE INDEX enrollments_classroom_status_idx ON enrollments(classroom_id, status, created_at);

    CREATE TABLE enrollment_requests (
      id uuid PRIMARY KEY,
      classroom_id uuid NOT NULL REFERENCES classrooms(id),
      student_user_id uuid NOT NULL REFERENCES student_profiles(user_id),
      institutional_email text NOT NULL
        CHECK(institutional_email = lower(institutional_email) AND institutional_email LIKE '%@undc.edu.pe'),
      status text NOT NULL CHECK(status IN ('pending','approved','rejected')),
      requested_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      resolved_by uuid REFERENCES teacher_profiles(user_id),
      CHECK ((status = 'pending') = (resolved_at IS NULL AND resolved_by IS NULL)),
      UNIQUE(classroom_id, student_user_id)
    );
    CREATE INDEX enrollment_requests_classroom_status_idx
      ON enrollment_requests(classroom_id, status, requested_at);
  `);
}

export async function down() {
  throw new Error('Reversión destructiva deshabilitada: prepara una migración correctiva y un respaldo.');
}
