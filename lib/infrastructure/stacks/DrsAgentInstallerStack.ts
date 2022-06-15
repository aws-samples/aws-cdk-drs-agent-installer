import {Aws, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {CfnAssociation, CfnDocument} from "aws-cdk-lib/aws-ssm";
import {BlockPublicAccess, Bucket, BucketEncryption} from "aws-cdk-lib/aws-s3";
import {Effect, IPrincipal, ManagedPolicy, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {NagSuppressions} from "cdk-nag";

export interface DrsAgentInstallerStackConfig extends StackProps {
    assumeDrsRolePrincipals: IPrincipal[],
    documentName: string,
    documentVersion: string
    tagKeyToMatch: string
    tagValuesToMatch: string[]
    installCheckVolumesScript: boolean
}

export class DrsAgentInstallerStack extends Stack {
    readonly documentName: string

    constructor(scope: Construct, id: string, props: DrsAgentInstallerStackConfig) {
        super(scope, id, props);

        const installationRole = new Role(this, "drs-installation-role", {
            assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromManagedPolicyArn(this, "AWSElasticDisasterRecoveryAgentInstallationPolicy", "arn:aws:iam::aws:policy/AWSElasticDisasterRecoveryAgentInstallationPolicy")]
        })

        installationRole.assumeRolePolicy?.addStatements(
            new PolicyStatement({
                actions: ['sts:AssumeRole'],
                effect: Effect.ALLOW,
                principals: props.assumeDrsRolePrincipals
            }))

        const bucket = new Bucket(this, "state-manager-log-bucket", {
            bucketName: `state-manager-logs-${this.account}-${this.region}`,
            //REMOVE THIS FOR REAL DEPLOYMENTS!
            autoDeleteObjects: true,
            removalPolicy: RemovalPolicy.DESTROY,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            encryption: BucketEncryption.S3_MANAGED,
            enforceSSL: true
        })
        const checkVolumesScript = `#!/bin/bash
instanceId=\`curl --silent http://169.254.169.254/latest/meta-data/instance-id\`;
vc=\`aws --region ${Aws.REGION} ec2 describe-volumes | jq --arg instanceId "$instanceId" -r ".Volumes[].Attachments[] | select(.InstanceId==\\"$instanceId\\") | select(.State==\\"attached\\")|.VolumeId" | wc -l\`
if test -f "/tmp/volume-count"; then
    echo "/tmp/volume-count exists."
    old_volume_count=$(cat "/tmp/volume-count")
    echo "vc=$vc, old_volume_count=$old_volume_count"
    if [ "$vc" -gt "$old_volume_count" ]; then
       echo $vc > /tmp/volume-count
       echo "Volume count changed from $old_volume_count to $vc"
       aws --region \`curl --silent http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region\` ssm send-command  --instance-ids \"$instanceId\" --document-name "install-drs-agent";
    else
       echo "Volume count not greater than $old_volume_count"
       echo $vc > "/tmp/volume-count"
    fi
else
    echo "/tmp/volume-count does not exist, creating with $vc"
    echo $vc > "/tmp/volume-count"
fi`
        const runCommands = [
            "sudo apt-get install -y jq",
            `aws sts assume-role --role-arn ${installationRole.roleArn} --role-session-name drs_agent | jq -r '.Credentials' > /tmp/credentials.txt`,
            "export AccessKey=$(cat /tmp/credentials.txt | jq -r '.AccessKeyId')",
            "export SecretAccessKey=$(cat /tmp/credentials.txt | jq -r '.SecretAccessKey')",
            "export SessionToken=$(cat /tmp/credentials.txt | jq -r '.SessionToken')",
            "rm /tmp/credentials.txt",
            `wget -O /tmp/aws-replication-installer-init.py https://aws-elastic-disaster-recovery-${this.region}.s3.amazonaws.com/latest/linux/aws-replication-installer-init.py`,
            `python3 /tmp/aws-replication-installer-init.py --region ${this.region} --no-prompt --aws-access-key-id $AccessKey --aws-secret-access-key $SecretAccessKey --aws-session-token $SessionToken`,
            "result=$?"]
        if (props.installCheckVolumesScript) {
            runCommands.push(
                `echo $\'${checkVolumesScript}\' > /tmp/check-volumes`,
                "chmod 755 /tmp/check-volumes",
                "sed -i  '0,/\\$/{s/\\$//}' /tmp/check-volumes",
                "(crontab -l ; echo \"*/30 * * * * /tmp/check-volumes >>/tmp/check-volumes.log 2>&1\") | sort - | uniq - | crontab -")
        }
        runCommands.push("if [ $result -ne 0 ]; then echo \"Installation failed\" 1>&2 && exit $result; fi")
        const document = new CfnDocument(this, "install-drs-agent-document", {
            documentType: "Command",
            content: {
                schemaVersion: "2.2",
                description: "Install Elastic DR agent",
                mainSteps: [
                    {
                        name: "install",
                        action: "aws:runShellScript",
                        inputs: {
                            runCommand: runCommands
                        }
                    }

                ]
            },
            name: props.documentName,
            targetType: "/AWS::EC2::Instance",
            versionName: props.documentVersion
        })
        this.documentName = document.name!
        const association = new CfnAssociation(this, "install-drs-agent-on-tagged-ec2-instances", {
            name: document.name!,
            applyOnlyAtCronInterval: false,
            associationName: "drs-agent-installation-association",
            documentVersion: document.versionName,
            scheduleExpression: "cron(0 0/30 * * * ? *)",
            complianceSeverity: "CRITICAL",
            targets: [
                {
                    key: `tag:${props.tagKeyToMatch}`,
                    values: props.tagValuesToMatch
                }
            ],

            outputLocation: {
                s3Location: {
                    outputS3BucketName: bucket.bucketName,
                    outputS3Region: this.region,
                    outputS3KeyPrefix: "drs-agent-installation-association"
                }
            }
        })
        association.addDependsOn(document)

        //cdk nag suppressions
        NagSuppressions.addResourceSuppressionsByPath(this, "/drs-agent-installer/drs-installation-role/Resource", [{
            id: "AwsSolutions-IAM4",
            reason: "I'm ok using managed policies for this example"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/drs-agent-installer/state-manager-log-bucket/Resource", [{
            id: "AwsSolutions-S1",
            reason: "No need for access logs on this bucket"
        }])
    }
}
