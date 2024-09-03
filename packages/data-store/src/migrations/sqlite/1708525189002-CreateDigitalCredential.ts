import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateDigitalCredential1708525189002 implements MigrationInterface {
  name = 'CreateDigitalCredential1708525189002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TODO FK for parent
    await queryRunner.query(`
            CREATE TABLE "DigitalCredential" (
                "id" varchar PRIMARY KEY NOT NULL,
                "parent_id" text, 
                "document_type" varchar CHECK( "document_type" IN ('VC', 'VP', 'C', 'P') ) NOT NULL,
                "regulation_type" varchar CHECK( "regulation_type" IN ('PID', 'QEAA', 'EAA', 'NON_REGULATED') ) NOT NULL DEFAULT 'NON_REGULATED',
                "document_format" varchar CHECK( "document_format" IN ('JSON_LD', 'JWT', 'SD_JWT', 'MSO_MDOC') ) NOT NULL,
                "credential_role" varchar CHECK( "credential_role" IN ('ISSUER', 'VERIFIER', 'HOLDER') ) NOT NULL,
                "raw_document" text NOT NULL,
                "uniform_document" text NOT NULL,
                "credential_id" text,
                "hash" text NOT NULL UNIQUE,
                "kms_key_ref" text NOT NULL,
                "identifier_method" text NOT NULL,
                "issuer_correlation_type" varchar CHECK( "issuer_correlation_type" IN ('DID', 'KID', 'URL', 'X509_SAN') ) NOT NULL,
                "subject_correlation_type" varchar CHECK( "subject_correlation_type" IN ('DID', 'KID', 'URL', 'X509_SAN') ),
                "issuer_correlation_id" text NOT NULL,
                "subject_correlation_id" text,
                "rp_correlation_id" text,
                "rp_correlation_type" varchar CHECK( "issuer_correlation_type" IN ('DID', 'KID', 'URL', 'X509_SAN') ),
                "verified_state" varchar CHECK( "verified_state" IN ('REVOKED', 'VERIFIED', 'EXPIRED') ),
                "tenant_id" text,
                "created_at" datetime NOT NULL DEFAULT (datetime('now')),
                "last_updated_at" datetime NOT NULL DEFAULT (datetime('now')),
                "presented_at" datetime,
                "valid_from" datetime,
                "valid_until" datetime,
                "verified_at" datetime,
                "revoked_at" datetime
            )
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "DigitalCredential"`)
  }
}
