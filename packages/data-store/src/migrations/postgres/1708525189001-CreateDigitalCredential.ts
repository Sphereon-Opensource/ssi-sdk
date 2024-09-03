import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateDigitalCredential1708525189001 implements MigrationInterface {
  name = 'CreateDigitalCredential1708525189001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "digital_document_type" AS ENUM('VC', 'VP', 'C', 'P')`)
    await queryRunner.query(`CREATE TYPE "digital_regulation_type" AS ENUM('PID', 'QEAA', 'EAA', 'NON_REGULATED')`)
    await queryRunner.query(`CREATE TYPE "digital_credential_document_format" AS ENUM('JSON_LD', 'JWT', 'SD_JWT', 'MSO_MDOC')`)
    await queryRunner.query(`CREATE TYPE "digital_credential_credential_role" AS ENUM('ISSUER', 'VERIFIER', 'HOLDER')`)
    await queryRunner.query(`CREATE TYPE "digital_credential_correlation_type" AS ENUM('DID', 'KID', 'URL', 'X509_SAN')`)
    await queryRunner.query(`CREATE TYPE "digital_credential_state_type" AS ENUM('REVOKED', 'VERIFIED', 'EXPIRED')`)

    // TODO FK for parent

    await queryRunner.query(`
      CREATE TABLE "DigitalCredential" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "parent_id" text,
        "document_type" "digital_document_type" NOT NULL,
        "regulation_type" "digital_regulation_type" NOT NULL DEFAULT "NON_REGULATED",
        "document_format" "digital_credential_document_format" NOT NULL,
        "credential_role" "digital_credential_credential_role" NOT NULL,
        "raw_document" text NOT NULL,
        "uniform_document" text NOT NULL,
        "credential_id" text,
        "hash" text NOT NULL UNIQUE,
        "kms_key_ref" text NOT NULL,
        "identifier_method" text NOT NULL,
        "issuer_correlation_type" "digital_credential_correlation_type" NOT NULL,
        "subject_correlation_type" "digital_credential_correlation_type",
        "issuer_correlation_id" text NOT NULL,
        "subject_correlation_id" text,
        "verified_state" "digital_credential_state_type",
        "rp_correlation_id" text,
        "rp_correlation_type" "digital_credential_correlation_type",
        "tenant_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "last_updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "presented_at" DATE,
        "valid_from" DATE,
        "valid_until" DATE,
        "verified_at" DATE,
        "revoked_at" DATE,
        PRIMARY KEY ("id")
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "DigitalCredential"`)
    await queryRunner.query(`DROP TYPE "digital_credential_state_type"`)
    await queryRunner.query(`DROP TYPE "digital_credential_correlation_type"`)
    await queryRunner.query(`DROP TYPE "digital_credential_document_format"`)
    await queryRunner.query(`DROP TYPE "digital_credential_credential_role"`)
    await queryRunner.query(`DROP TYPE "digital_regulation_type"`)
    await queryRunner.query(`DROP TYPE "digital_document_type"`)
  }
}
