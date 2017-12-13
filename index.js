/**
 * @author Rajeesh <rajeesh.k@iinerds.com>
 * @version: 0.3
 */


'use strict'

const jsonQuery = require('json-query');
var uuid = require('node-uuid');
var AWS = require('aws-sdk');

/**
 * Define AWS API version
 */

AWS.config.apiVersions = {
  cloudformation: '2010-05-15',
  // other service API versions
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var apigateway = new AWS.APIGateway();
var lambda = new AWS.Lambda();

// Lambda handler start here.
exports.handler = function(event, context, callback) {

    //Retrieve the CodePipeline ID 
    var jobId = event["CodePipeline.job"].id;

    /**
     * Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
     * health checked by this function.
     */
    var stackName = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters; 

    // Define the Cloudformation stack parameters. The processed CF template need to be used.     
    var stackParams = {
        StackName: stackName || '',
        TemplateStage: 'Processed'
    };

    // REST Api id of the deployed API.
    var restApiIdVal, functionArn, apiArn = '';

    // Define the Success function.
    var putJobSuccess = function(message) {
      
        var cpParams = {
            jobId: jobId
        };

        console.log("Job Id: ", jobId);
        //console.log("Stack Name: ", stackName);
        codepipeline.putJobSuccessResult(cpParams, function(err, data) {
            if (err) {
                callback(err);
            }
            else {
                cloudformation.getTemplate(stackParams, function(err, data) {
                    if (err) { 
                        //console.log(err, err.stack);
                        callback(err);
                    }
                    else {
                        //console.log(data);
                        var templateBody = data.TemplateBody;
                        var jsonTemplate = JSON.parse(templateBody);
                        var restApiName = jsonTemplate.Resources.CCTApi.Properties.Name;
                        var functionName = jsonTemplate.Resources.CCTFunction.Properties.FunctionName;
                        functionArn +=  functionName;

                        var apiListParams = {
                            limit: 20,   
                        };
                        
                        apigateway.getRestApis(apiListParams, function(err, data) {
                            if (err) {
                                //console.log(err, err.stack) 
                            }    
                            else {
                                //console.log(data); 
                                var currentApiData = jsonQuery('items[name=' + restApiName+ '].id', {
                                    data: data
                                }) 

                                restApiIdVal = currentApiData.value;
                                apiArn += restApiIdVal + '/*/';
                                var resourceUri = '/get';
                                apiArn += 'GET' + resourceUri;

                                var apiParams = {
                                    restApiId: restApiIdVal /* required */
                                };
                                
                                // apigateway.getResources(apiParams, function(err, data) {
                                //     if (err) console.log(err, err.stack); // an error occurred
                                //     else     
                                //     console.log(data);
                                //     //var resourceUri = data.items[1].path;
                                //     //var resourceMethod = data.items[1].resourceMethods;
                                //     //console.log(resourceMethod);
                                //     //resourceMethod = Object.keys(resourceMethod)[0];
                                //     //console.log(Object.keys(resourceMethod)[0]);
                                //     console.log(apiArn);
                                //     ;          
                                // });

                                var addPermParams = {
                                    Action: "lambda:InvokeFunction", 
                                    FunctionName: functionArn, 
                                    Principal: "apigateway.amazonaws.com", 
                                    SourceArn: apiArn, 
                                    Qualifier: '',
                                    StatementId: uuid.v4()
                                };

                                apigateway.getStages(apiParams, function(err, data) {
                                    if (err) console.log(err, err.stack); // an error occurred
                                    else     
                                    
                                    var apiStages = jsonQuery('item[*].stageName', {
                                        data: data
                                    })  

                                    apiStages = apiStages.value;

                                    for (var stageIndex = 0; stageIndex < apiStages.length; stageIndex++) {
                                        var stageName = apiStages[stageIndex];
                                        addPermParams['Qualifier'] = stageName;
                                        lambda.addPermission(addPermParams, function(err, data) {
                                            if (err) console.log(err, err.stack); // an error occurred
                                            else     console.log(data);           // successful response
                                        });
                                    }
                                  });
                            }    
                        });
                    }
                });
                callback(null, message);
            }    
        });    
    }    

   // Notify AWS CodePipeline of a failed job
   var putJobFailure = function(message) {
    var params = {
        jobId: jobId,
        failureDetails: {
            message: JSON.stringify(message),
            type: 'JobFailed',
            externalExecutionId: context.invokeid
        }
    };
    codepipeline.putJobFailureResult(params, function(err, data) {
        context.fail(message);      
    });
};

    // Validate the URL passed in UserParameters
    if(!stackName) {
        putJobFailure('The UserParameters field must contain the Stack Name!');  
        return;
    }

    putJobSuccess('Success');

};